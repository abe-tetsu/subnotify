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
	log.Printf("subnotify worker started (polling: %ds, workspace: %s, notify API: %s)", cfg.PollingIntervalSec, cfg.Workspace, cfg.NotifyAPIURL)

	redirectURL := strings.TrimRight(cfg.PublicBaseURL, "/") + cfg.YouTubeAuthCallbackPath
	oauth := youtube.NewOAuthService(cfg.YouTubeClientID, cfg.YouTubeClientSecret, redirectURL, cfg.DataDir)
	store := notify.NewStore(cfg.DataDir)
	httpClient := &http.Client{Timeout: 10 * time.Second}

	initialized := false
	seen := store.LoadSeenSubscribers()
	stats := store.LoadStats()
	if len(seen) > 0 {
		initialized = true
		log.Printf("worker: 既知の登録者 %d 人をファイルから復元 (前回の総登録者数: %d)", len(seen), stats.LastTotalCount)
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

			// 総登録者数を取得
			totalCount, err := oauth.FetchSubscriberCount(context.Background())
			if err != nil {
				if errors.Is(err, os.ErrNotExist) {
					log.Printf("worker: トークンファイルが見つかりません")
				} else {
					log.Printf("worker: 登録者数取得エラー: %v", err)
				}
				continue
			}

			// 公開登録者一覧を取得
			subscribers, err := oauth.FetchMySubscribers(context.Background())
			if err != nil {
				log.Printf("worker: 登録者一覧取得エラー: %v", err)
				continue
			}

			// 初回: 記録するだけで通知しない
			if !initialized {
				for _, sub := range subscribers {
					seen[sub.ChannelID] = true
				}
				initialized = true
				stats.LastTotalCount = totalCount
				stats.LastUpdated = time.Now().UTC().Format(time.RFC3339)
				if err := store.SaveSeenSubscribers(seen); err != nil {
					log.Printf("worker: 既知登録者の保存エラー: %v", err)
				}
				if err := store.SaveStats(stats); err != nil {
					log.Printf("worker: stats の保存エラー: %v", err)
				}
				log.Printf("worker: 初回取得完了。公開登録者 %d 人、総登録者数 %d 人を記録。", len(seen), totalCount)
				continue
			}

			// 公開登録者の差分検出（名前付き通知）
			newPublicSubs := notify.DetectNewSubscribers(subscribers, seen)
			for _, sub := range newPublicSubs {
				seen[sub.ChannelID] = true
				log.Printf("worker: 新規公開登録者を検出: %s", sub.Title)
				if err := sendEvent(httpClient, cfg.NotifyAPIURL, cfg.Workspace, notify.NewSubscriberEvent(sub)); err != nil {
					log.Printf("worker: 通知送信エラー: %v", err)
				}
			}

			// 匿名登録者の検出
			totalIncrease := totalCount - stats.LastTotalCount
			publicIncrease := len(newPublicSubs)
			anonymousCount := totalIncrease - publicIncrease
			if anonymousCount < 0 {
				anonymousCount = 0
			}

			if anonymousCount > 0 {
				log.Printf("worker: 匿名登録者 %d 人を検出 (総登録者: %d→%d, 公開新規: %d)", anonymousCount, stats.LastTotalCount, totalCount, publicIncrease)
				for i := 0; i < anonymousCount; i++ {
					if err := sendEvent(httpClient, cfg.NotifyAPIURL, cfg.Workspace, notify.NewAnonymousSubscriberEvent()); err != nil {
						log.Printf("worker: 匿名通知送信エラー: %v", err)
					}
				}
			}

			// 状態を更新
			stats.LastTotalCount = totalCount
			stats.LastUpdated = time.Now().UTC().Format(time.RFC3339)
			if err := store.SaveSeenSubscribers(seen); err != nil {
				log.Printf("worker: 既知登録者の保存エラー: %v", err)
			}
			if err := store.SaveStats(stats); err != nil {
				log.Printf("worker: stats の保存エラー: %v", err)
			}

			if len(newPublicSubs) > 0 || anonymousCount > 0 {
				log.Printf("worker: 通知送出完了 (公開: %d, 匿名: %d)", len(newPublicSubs), anonymousCount)
			}

		case <-shutdownSignal:
			log.Printf("subnotify worker shutting down")
			return
		}
	}
}

func sendEvent(client *http.Client, apiURL string, workspace string, event notify.NotifyEvent) error {
	url := strings.TrimRight(apiURL, "/") + "/v1/events/" + workspace

	body, err := json.Marshal(map[string]string{
		"subscriberName": event.SubscriberName,
		"kind":           event.Kind,
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
