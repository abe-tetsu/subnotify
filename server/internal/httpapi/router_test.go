package httpapi

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/abe-tetsu/subnotify/server/internal/app"
	"github.com/abe-tetsu/subnotify/server/internal/config"
)

func TestYouTubeConnectionFlow(t *testing.T) {
	application := app.New(config.Config{
		AppEnv:                  "test",
		PublicBaseURL:           "http://localhost:8080",
		YouTubeAuthPath:         "/v1/youtube/auth/start",
		YouTubeAuthCallbackPath: "/v1/youtube/auth/callback",
	})
	router := NewRouter(application)

	t.Run("initial status is not connected", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/v1/youtube/connection?channel_hint=%40demo", nil)

		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusOK {
			t.Fatalf("expected status 200, got %d", recorder.Code)
		}

		var response youtubeConnectionResponse
		if err := json.Unmarshal(recorder.Body.Bytes(), &response); err != nil {
			t.Fatalf("failed to decode response: %v", err)
		}

		if response.Connected {
			t.Fatalf("expected not connected")
		}
		if response.Stage != "not_connected" {
			t.Fatalf("expected stage not_connected, got %s", response.Stage)
		}
	})

	t.Run("start then callback marks connection as connected", func(t *testing.T) {
		startRecorder := httptest.NewRecorder()
		startRequest := httptest.NewRequest(http.MethodGet, "/v1/youtube/auth/start?channel_hint=%40demo", nil)
		router.ServeHTTP(startRecorder, startRequest)

		if startRecorder.Code != http.StatusOK {
			t.Fatalf("expected start status 200, got %d", startRecorder.Code)
		}

		midRecorder := httptest.NewRecorder()
		midRequest := httptest.NewRequest(http.MethodGet, "/v1/youtube/connection?channel_hint=%40demo", nil)
		router.ServeHTTP(midRecorder, midRequest)

		var midResponse youtubeConnectionResponse
		if err := json.Unmarshal(midRecorder.Body.Bytes(), &midResponse); err != nil {
			t.Fatalf("failed to decode mid response: %v", err)
		}
		if midResponse.Stage != "auth_started" {
			t.Fatalf("expected stage auth_started, got %s", midResponse.Stage)
		}

		callbackRecorder := httptest.NewRecorder()
		callbackRequest := httptest.NewRequest(http.MethodGet, "/v1/youtube/auth/callback?channel_hint=%40demo", nil)
		router.ServeHTTP(callbackRecorder, callbackRequest)

		if callbackRecorder.Code != http.StatusOK {
			t.Fatalf("expected callback status 200, got %d", callbackRecorder.Code)
		}

		finalRecorder := httptest.NewRecorder()
		finalRequest := httptest.NewRequest(http.MethodGet, "/v1/youtube/connection?channel_hint=%40demo", nil)
		router.ServeHTTP(finalRecorder, finalRequest)

		var finalResponse youtubeConnectionResponse
		if err := json.Unmarshal(finalRecorder.Body.Bytes(), &finalResponse); err != nil {
			t.Fatalf("failed to decode final response: %v", err)
		}

		if !finalResponse.Connected {
			t.Fatalf("expected connected after callback")
		}
		if finalResponse.Stage != "connected" {
			t.Fatalf("expected stage connected, got %s", finalResponse.Stage)
		}
		if finalResponse.ConnectedAt == "" {
			t.Fatalf("expected connectedAt to be set")
		}
	})
}
