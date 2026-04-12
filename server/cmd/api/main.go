package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/app"
	"github.com/abe-tetsu/subnotify/server/internal/config"
	"github.com/abe-tetsu/subnotify/server/internal/httpapi"
	"github.com/abe-tetsu/subnotify/server/internal/youtube"
)

func main() {
	cfg := config.Load()

	var oauth youtube.OAuthProvider
	if cfg.YouTubeClientID != "" && cfg.YouTubeClientSecret != "" {
		redirectURL := strings.TrimRight(cfg.PublicBaseURL, "/") + cfg.YouTubeAuthCallbackPath
		oauth = youtube.NewOAuthService(cfg.YouTubeClientID, cfg.YouTubeClientSecret, redirectURL, cfg.DataDir)
		log.Printf("OAuth credentials loaded from environment")
	} else {
		log.Printf("OAuth credentials not set. Use desktop settings to configure.")
	}

	application := app.New(cfg, oauth)

	server := &http.Server{
		Addr:              cfg.APIListenAddr,
		Handler:           httpapi.NewRouter(application),
		ReadHeaderTimeout: 5 * time.Second,
	}

	log.Printf("subnotify api starting on %s", cfg.APIListenAddr)

	go func() {
		if err := server.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatalf("api listen failed: %v", err)
		}
	}()

	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, syscall.SIGINT, syscall.SIGTERM)
	<-shutdownSignal

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := server.Shutdown(ctx); err != nil {
		log.Printf("api shutdown failed: %v", err)
	}
}
