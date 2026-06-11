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

	"cloud.google.com/go/firestore"

	"github.com/abe-tetsu/subnotify/server/internal/app"
	"github.com/abe-tetsu/subnotify/server/internal/auth"
	"github.com/abe-tetsu/subnotify/server/internal/config"
	"github.com/abe-tetsu/subnotify/server/internal/httpapi"
	"github.com/abe-tetsu/subnotify/server/internal/notify"
	"github.com/abe-tetsu/subnotify/server/internal/store"
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
		log.Printf("OAuth credentials not set.")
	}

	application := app.New(cfg, oauth)
	eventStore := notify.NewStore(cfg.DataDir)
	eventBroker := notify.NewBroker()
	eventPoller := notify.NewPoller()

	var firestoreClient *firestore.Client
	var sessionStore *auth.SessionStore
	var settingsStore *store.SettingsStore

	if cfg.FirestoreProjectID != "" {
		ctx := context.Background()
		client, err := firestore.NewClient(ctx, cfg.FirestoreProjectID)
		if err != nil {
			log.Printf("Firestore クライアント初期化に失敗: %v (Firestore は無効化されます)", err)
		} else {
			firestoreClient = client
			sessionStore = auth.NewSessionStore(firestoreClient)
			settingsStore = store.NewSettingsStore(firestoreClient)
			log.Printf("Firestore クライアント初期化完了 (project: %s)", cfg.FirestoreProjectID)
		}
	}

	handlerOpts := []any{eventStore, eventBroker, eventPoller}
	if sessionStore != nil {
		handlerOpts = append(handlerOpts, sessionStore)
	}
	if settingsStore != nil {
		handlerOpts = append(handlerOpts, settingsStore)
	}

	server := &http.Server{
		Addr:              cfg.APIListenAddr,
		Handler:           httpapi.NewRouter(application, handlerOpts...),
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

	if firestoreClient != nil {
		_ = firestoreClient.Close()
	}
}
