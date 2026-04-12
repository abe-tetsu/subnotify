package httpapi

import (
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/app"
)

type metaResponse struct {
	Name           string `json:"name"`
	Version        string `json:"version"`
	Environment    string `json:"environment"`
	PublicBaseURL  string `json:"publicBaseUrl"`
	OverlayBaseURL string `json:"overlayBaseUrl"`
}

type healthResponse struct {
	OK        bool   `json:"ok"`
	Service   string `json:"service"`
	Timestamp string `json:"timestamp"`
}

type youtubeConnectionResponse struct {
	Connected     bool     `json:"connected"`
	Stage         string   `json:"stage"`
	ChannelHint   string   `json:"channelHint"`
	ChannelLabel  string   `json:"channelLabel"`
	OAuthStartURL string   `json:"oauthStartUrl"`
	LastEvent     string   `json:"lastEvent"`
	Guidance      []string `json:"guidance"`
}

func NewRouter(application app.App) http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /health", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, healthResponse{
			OK:        true,
			Service:   app.Name,
			Timestamp: time.Now().UTC().Format(time.RFC3339),
		})
	})

	mux.HandleFunc("GET /v1/meta", func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, metaResponse{
			Name:           app.Name,
			Version:        app.Version,
			Environment:    application.Config.AppEnv,
			PublicBaseURL:  application.Config.PublicBaseURL,
			OverlayBaseURL: application.Config.OverlayBaseURL,
		})
	})

	mux.HandleFunc("GET /v1/youtube/connection", func(w http.ResponseWriter, r *http.Request) {
		channelHint := strings.TrimSpace(r.URL.Query().Get("channel_hint"))
		channelLabel := "チャンネル未選択"
		if channelHint != "" {
			channelLabel = channelHint
		}

		writeJSON(w, http.StatusOK, youtubeConnectionResponse{
			Connected:     false,
			Stage:         "not_connected",
			ChannelHint:   channelHint,
			ChannelLabel:  channelLabel,
			OAuthStartURL: strings.TrimRight(application.Config.PublicBaseURL, "/") + application.Config.YouTubeAuthPath,
			LastEvent:     "OAuth 接続はまだ開始していません。",
			Guidance: []string{
				"desktop から接続を開始したら backend の OAuth 開始 URL を開く",
				"認可完了後に接続済みのチャンネル情報を返す",
				"登録者監視が有効になったら dashboard に反映する",
			},
		})
	})

	return mux
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, `{"ok":false}`, http.StatusInternalServerError)
	}
}
