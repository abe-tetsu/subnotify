package main

import (
	"context"
	"errors"
	"log"
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
	log.Printf("subnotify worker started in %s mode (polling interval: %ds)", cfg.AppEnv, cfg.PollingIntervalSec)

	redirectURL := strings.TrimRight(cfg.PublicBaseURL, "/") + cfg.YouTubeAuthCallbackPath
	oauth := youtube.NewOAuthService(cfg.YouTubeClientID, cfg.YouTubeClientSecret, redirectURL, cfg.DataDir)
	store := notify.NewStore(cfg.DataDir)

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

			events := make([]notify.NotifyEvent, 0, len(newSubs))
			for _, sub := range newSubs {
				seen[sub.ChannelID] = true
				log.Printf("worker: 新規登録者を検出: %s", sub.Title)
				events = append(events, notify.NewSubscriberEvent(sub))
			}

			if err := store.SaveSeenSubscribers(seen); err != nil {
				log.Printf("worker: 既知登録者の保存エラー: %v", err)
			}

			if err := store.AppendEvents(events); err != nil {
				log.Printf("worker: イベント書き出しエラー: %v", err)
			}

			log.Printf("worker: %d 件の新規登録通知を書き出し。", len(newSubs))

		case <-shutdownSignal:
			log.Printf("subnotify worker shutting down")
			return
		}
	}
}
