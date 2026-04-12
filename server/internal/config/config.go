package config

import "os"

type Config struct {
	AppEnv         string
	APIListenAddr  string
	PublicBaseURL  string
	OverlayBaseURL string
	YouTubeAuthPath string
}

func Load() Config {
	return Config{
		AppEnv:         envOrDefault("SUBNOTIFY_APP_ENV", "development"),
		APIListenAddr:  envOrDefault("SUBNOTIFY_API_LISTEN_ADDR", ":8080"),
		PublicBaseURL:  envOrDefault("SUBNOTIFY_PUBLIC_BASE_URL", "http://localhost:8080"),
		OverlayBaseURL: envOrDefault("SUBNOTIFY_OVERLAY_BASE_URL", "https://overlay.example.com/subnotify"),
		YouTubeAuthPath: envOrDefault(
			"SUBNOTIFY_YOUTUBE_AUTH_PATH",
			"/v1/youtube/auth/start",
		),
	}
}

func envOrDefault(key, fallback string) string {
	value := os.Getenv(key)
	if value == "" {
		return fallback
	}

	return value
}
