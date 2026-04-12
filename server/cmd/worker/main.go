package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/config"
	"github.com/abe-tetsu/subnotify/server/internal/notify"
	"github.com/abe-tetsu/subnotify/server/internal/youtube"
)

func main() {
	cfg := config.Load()
	log.Printf("subnotify worker started (polling: %ds, notify API: %s)", cfg.PollingIntervalSec, cfg.NotifyAPIURL)

	redirectURL := strings.TrimRight(cfg.PublicBaseURL, "/") + cfg.YouTubeAuthCallbackPath
	oauth := youtube.NewOAuthService(cfg.YouTubeClientID, cfg.YouTubeClientSecret, redirectURL, cfg.DataDir)
	store := notify.NewStore(cfg.DataDir)
	httpClient := &http.Client{Timeout: 10 * time.Second}

	initialized := false
	seen := store.LoadSeenSubscribers()
	if len(seen) > 0 {
		initialized = true
		log.Printf("worker: 既知の登録者 %d 人をファイルから復元", len(seen))
	}

	ticker := time.NewTicker(time.Duration(cfg.PollingIntervalSec) * time.Second)
	defer ticker.Stop()

	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			if !oauth.HasToken() {
				log.Printf("worker: トークン未保存。OAuth 完了を待機中。")
				continue
			}

			subscribers, err := oauth.FetchMySubscribers(context.Background())
			if err != nil {
				if errors.Is(err, os.ErrNotExist) {
					log.Printf("worker: トークンファイルが見つかりません")
				} else {
					log.Printf("worker: 登録者取得エラー: %v", err)
				}
				continue
			}

			if !initialized {
				for _, sub := range subscribers {
					seen[sub.ChannelID] = true
				}
				initialized = true
				if err := store.SaveSeenSubscribers(seen); err != nil {
					log.Printf("worker: 既知登録者の保存エラー: %v", err)
				}
				log.Printf("worker: 初回取得完了。既存登録者 %d 人を記録。", len(seen))
				continue
			}

			newSubs := notify.DetectNewSubscribers(subscribers, seen)
			if len(newSubs) == 0 {
				continue
			}

			for _, sub := range newSubs {
				seen[sub.ChannelID] = true
				log.Printf("worker: 新規登録者を検出: %s", sub.Title)

				if err := sendNotifyEvent(httpClient, cfg.NotifyAPIURL, sub.Title); err != nil {
					log.Printf("worker: 通知送信エラー: %v", err)
				} else {
					log.Printf("worker: 通知送信完了: %s", sub.Title)
				}
			}

			if err := store.SaveSeenSubscribers(seen); err != nil {
				log.Printf("worker: 既知登録者の保存エラー: %v", err)
			}

			log.Printf("worker: %d 件の新規登録通知を送出。", len(newSubs))

		case <-shutdownSignal:
			log.Printf("subnotify worker shutting down")
			return
		}
	}
}

func sendNotifyEvent(client *http.Client, apiURL string, subscriberName string) error {
	url := strings.TrimRight(apiURL, "/") + "/v1/test-event"

	body, err := json.Marshal(map[string]string{
		"subscriberName": subscriberName,
	})
	if err != nil {
		return fmt.Errorf("JSON の作成に失敗: %w", err)
	}

	resp, err := client.Post(url, "application/json", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("API への送信に失敗: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("API がエラーを返しました (HTTP %d)", resp.StatusCode)
	}

	return nil
}
