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
	"github.com/abe-tetsu/subnotify/server/internal/youtube"
)

func main() {
	cfg := config.Load()
	log.Printf("subnotify worker started in %s mode", cfg.AppEnv)

	redirectURL := strings.TrimRight(cfg.PublicBaseURL, "/") + cfg.YouTubeAuthCallbackPath
	oauth := youtube.NewOAuthService(cfg.YouTubeClientID, cfg.YouTubeClientSecret, redirectURL, cfg.DataDir)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			token, err := oauth.LoadToken()
			if err != nil {
				if errors.Is(err, os.ErrNotExist) {
					log.Printf("worker: トークン未保存。OAuth 完了を待機中。")
				} else {
					log.Printf("worker: トークン読み込みエラー: %v", err)
				}
				continue
			}

			_ = token
			info, err := oauth.FetchChannelInfo(context.Background())
			if err != nil {
				log.Printf("worker: チャンネル情報取得エラー: %v", err)
				continue
			}

			log.Printf("worker: トークン有効。チャンネル: %s (%s)", info.Title, info.ID)

		case <-shutdownSignal:
			log.Printf("subnotify worker shutting down")
			return
		}
	}
}
