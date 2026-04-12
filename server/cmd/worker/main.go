package main

import (
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/config"
)

func main() {
	cfg := config.Load()
	log.Printf("subnotify worker started in %s mode", cfg.AppEnv)

	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	shutdownSignal := make(chan os.Signal, 1)
	signal.Notify(shutdownSignal, syscall.SIGINT, syscall.SIGTERM)

	for {
		select {
		case <-ticker.C:
			log.Printf("worker heartbeat: waiting for YouTube polling implementation")
		case <-shutdownSignal:
			log.Printf("subnotify worker shutting down")
			return
		}
	}
}
