package main

import (
	"context"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/app"
	"github.com/abe-tetsu/subnotify/server/internal/config"
	"github.com/abe-tetsu/subnotify/server/internal/httpapi"
)

func main() {
	cfg := config.Load()
	application := app.New(cfg)

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
