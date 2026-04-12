package httpapi

import (
	"encoding/json"
	"net/http"
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

	return mux
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, `{"ok":false}`, http.StatusInternalServerError)
	}
}
