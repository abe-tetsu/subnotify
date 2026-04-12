package config

import (
	"bufio"
	"fmt"
	"os"
	"strconv"
	"strings"
)

type Config struct {
	AppEnv                  string
	APIListenAddr           string
	PublicBaseURL           string
	OverlayBaseURL          string
	YouTubeAuthPath         string
	YouTubeAuthCallbackPath string
	YouTubeClientID         string
	YouTubeClientSecret     string
	DataDir                 string
	PollingIntervalSec      int
}

func Load() Config {
	loadEnvFile(".env.local")

	return Config{
		AppEnv:         envOrDefault("SUBNOTIFY_APP_ENV", "development"),
		APIListenAddr:  envOrDefault("SUBNOTIFY_API_LISTEN_ADDR", ":8080"),
		PublicBaseURL:  envOrDefault("SUBNOTIFY_PUBLIC_BASE_URL", "http://localhost:8080"),
		OverlayBaseURL: envOrDefault("SUBNOTIFY_OVERLAY_BASE_URL", "https://overlay.example.com/subnotify"),
		YouTubeAuthPath: envOrDefault(
			"SUBNOTIFY_YOUTUBE_AUTH_PATH",
			"/v1/youtube/auth/start",
		),
		YouTubeAuthCallbackPath: envOrDefault(
			"SUBNOTIFY_YOUTUBE_AUTH_CALLBACK_PATH",
			"/v1/youtube/auth/callback",
		),
		YouTubeClientID:     envOrDefault("SUBNOTIFY_YOUTUBE_CLIENT_ID", ""),
		YouTubeClientSecret: envOrDefault("SUBNOTIFY_YOUTUBE_CLIENT_SECRET", ""),
		DataDir:            envOrDefault("SUBNOTIFY_DATA_DIR", ".subnotify-data"),
		PollingIntervalSec: envOrDefaultInt("SUBNOTIFY_POLLING_INTERVAL_SEC", 30),
	}
}

func loadEnvFile(path string) {
	file, err := os.Open(path)
	if err != nil {
		return
	}
	defer file.Close()

	scanner := bufio.NewScanner(file)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		key, value, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if os.Getenv(key) == "" {
			_ = os.Setenv(key, value)
		}
	}
	if err := scanner.Err(); err != nil {
		fmt.Fprintf(os.Stderr, "[subnotify] .env.local の読み込みでエラー: %v\n", err)
	}
}

func envOrDefaultInt(key string, fallback int) int {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return fallback
	}
	return n
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
