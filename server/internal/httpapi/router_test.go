package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"golang.org/x/oauth2"

	"github.com/abe-tetsu/subnotify/server/internal/app"
	"github.com/abe-tetsu/subnotify/server/internal/config"
	"github.com/abe-tetsu/subnotify/server/internal/youtube"
)

type mockOAuth struct {
	authURL      string
	exchangeErr  error
	savedToken   *oauth2.Token
	hasTokenFlag bool
	channelInfo  youtube.ChannelInfo
	fetchErr     error
}

func (m *mockOAuth) AuthURL(state string) string {
	return m.authURL + "?state=" + state
}

func (m *mockOAuth) Exchange(_ context.Context, _ string) (*oauth2.Token, error) {
	if m.exchangeErr != nil {
		return nil, m.exchangeErr
	}
	return &oauth2.Token{AccessToken: "mock-access-token"}, nil
}

func (m *mockOAuth) SaveToken(token *oauth2.Token) error {
	m.savedToken = token
	m.hasTokenFlag = true
	return nil
}

func (m *mockOAuth) LoadToken() (*oauth2.Token, error) {
	if m.savedToken == nil {
		return nil, &mockNotExist{}
	}
	return m.savedToken, nil
}

func (m *mockOAuth) HasToken() bool {
	return m.hasTokenFlag
}

func (m *mockOAuth) FetchMySubscribers(_ context.Context) ([]youtube.Subscriber, error) {
	return nil, nil
}

func (m *mockOAuth) FetchChannelInfo(_ context.Context) (youtube.ChannelInfo, error) {
	if m.fetchErr != nil {
		return youtube.ChannelInfo{}, m.fetchErr
	}
	return m.channelInfo, nil
}

type mockNotExist struct{}

func (e *mockNotExist) Error() string { return "file does not exist" }

func TestYouTubeConnectionFlow(t *testing.T) {
	mock := &mockOAuth{
		authURL: "https://accounts.google.com/o/oauth2/v2/auth",
		channelInfo: youtube.ChannelInfo{
			ID:    "UC_test123",
			Title: "Test Channel",
		},
	}

	application := app.New(config.Config{
		DataDir: t.TempDir(),
		AppEnv:                  "test",
		PublicBaseURL:           "http://localhost:8080",
		YouTubeAuthPath:         "/v1/youtube/auth/start",
		YouTubeAuthCallbackPath: "/v1/youtube/auth/callback",
	}, mock)
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

	t.Run("auth start redirects to Google", func(t *testing.T) {
		recorder := httptest.NewRecorder()
		request := httptest.NewRequest(http.MethodGet, "/v1/youtube/auth/start?channel_hint=%40demo", nil)
		router.ServeHTTP(recorder, request)

		if recorder.Code != http.StatusFound {
			t.Fatalf("expected status 302, got %d", recorder.Code)
		}

		location := recorder.Header().Get("Location")
		if location == "" {
			t.Fatalf("expected Location header")
		}
	})

	t.Run("auth callback with valid state completes connection", func(t *testing.T) {
		// Start auth to generate state
		startRecorder := httptest.NewRecorder()
		startRequest := httptest.NewRequest(http.MethodGet, "/v1/youtube/auth/start?channel_hint=%40demo", nil)
		router.ServeHTTP(startRecorder, startRequest)

		// Extract state from redirect URL
		location := startRecorder.Header().Get("Location")
		if location == "" {
			t.Fatalf("expected Location header from start")
		}

		// Get connection to verify auth_started
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

		// Simulate callback — need to get the state from the redirect URL
		state := application.GenerateOAuthState()
		callbackRecorder := httptest.NewRecorder()
		callbackRequest := httptest.NewRequest(http.MethodGet, "/v1/youtube/auth/callback?code=mock-code&state="+state, nil)
		router.ServeHTTP(callbackRecorder, callbackRequest)

		if callbackRecorder.Code != http.StatusOK {
			t.Fatalf("expected callback status 200, got %d", callbackRecorder.Code)
		}

		// Verify connected
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
