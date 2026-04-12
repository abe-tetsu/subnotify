package app

import (
	"crypto/rand"
	"encoding/hex"
	"strings"
	"sync"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/config"
	"github.com/abe-tetsu/subnotify/server/internal/youtube"
)

const (
	Name    = "subnotify-server"
	Version = "0.1.0"
)

type App struct {
	Config            config.Config
	OAuth             youtube.OAuthProvider
	mu                sync.RWMutex
	youtubeConnection *YouTubeConnectionStore
}

func New(cfg config.Config, oauth youtube.OAuthProvider) *App {
	return &App{
		Config:            cfg,
		OAuth:             oauth,
		youtubeConnection: NewYouTubeConnectionStore(),
	}
}

func (a *App) SetOAuth(oauth youtube.OAuthProvider) {
	a.mu.Lock()
	defer a.mu.Unlock()
	a.OAuth = oauth
}

func (a *App) GetOAuth() youtube.OAuthProvider {
	a.mu.RLock()
	defer a.mu.RUnlock()
	return a.OAuth
}

func (a *App) BuildRedirectURL() string {
	return strings.TrimRight(a.Config.PublicBaseURL, "/") + a.Config.YouTubeAuthCallbackPath
}

type YouTubeConnectionSnapshot struct {
	Connected    bool
	Stage        string
	ChannelHint  string
	ChannelLabel string
	ConnectedAt  string
	LastEvent    string
}

type YouTubeConnectionStore struct {
	mu         sync.Mutex
	snapshot   YouTubeConnectionSnapshot
	oauthState string
}

func NewYouTubeConnectionStore() *YouTubeConnectionStore {
	return &YouTubeConnectionStore{
		snapshot: YouTubeConnectionSnapshot{
			Connected:    false,
			Stage:        "not_connected",
			ChannelLabel: "チャンネル未選択",
			LastEvent:    "OAuth 接続はまだ開始していません。",
		},
	}
}

func (a *App) GetYouTubeConnection(channelHint string) YouTubeConnectionSnapshot {
	a.youtubeConnection.mu.Lock()
	defer a.youtubeConnection.mu.Unlock()

	snapshot := a.youtubeConnection.snapshot
	if channelHint != "" && snapshot.ChannelHint == "" {
		snapshot.ChannelHint = channelHint
		snapshot.ChannelLabel = channelHint
	}
	if snapshot.ChannelLabel == "" {
		snapshot.ChannelLabel = "チャンネル未選択"
	}
	return snapshot
}

func (a *App) GenerateOAuthState() string {
	b := make([]byte, 16)
	_, _ = rand.Read(b)
	state := hex.EncodeToString(b)

	a.youtubeConnection.mu.Lock()
	defer a.youtubeConnection.mu.Unlock()
	a.youtubeConnection.oauthState = state

	return state
}

func (a *App) ValidateOAuthState(state string) bool {
	a.youtubeConnection.mu.Lock()
	defer a.youtubeConnection.mu.Unlock()

	if a.youtubeConnection.oauthState == "" || state != a.youtubeConnection.oauthState {
		return false
	}

	a.youtubeConnection.oauthState = ""
	return true
}

func (a *App) StartYouTubeAuth(channelHint string) YouTubeConnectionSnapshot {
	a.youtubeConnection.mu.Lock()
	defer a.youtubeConnection.mu.Unlock()

	channelLabel := "チャンネル未選択"
	if channelHint != "" {
		channelLabel = channelHint
	}

	a.youtubeConnection.snapshot = YouTubeConnectionSnapshot{
		Connected:    false,
		Stage:        "auth_started",
		ChannelHint:  channelHint,
		ChannelLabel: channelLabel,
		ConnectedAt:  "",
		LastEvent:    "Google 認可ページへリダイレクトしました。認可完了を待っています。",
	}

	return a.youtubeConnection.snapshot
}

func (a *App) CompleteYouTubeAuth(channelTitle, channelID string) YouTubeConnectionSnapshot {
	a.youtubeConnection.mu.Lock()
	defer a.youtubeConnection.mu.Unlock()

	channelLabel := "接続済みチャンネル"
	if channelTitle != "" {
		channelLabel = channelTitle
	}

	a.youtubeConnection.snapshot = YouTubeConnectionSnapshot{
		Connected:    true,
		Stage:        "connected",
		ChannelHint:  channelID,
		ChannelLabel: channelLabel,
		ConnectedAt:  time.Now().UTC().Format(time.RFC3339),
		LastEvent:    "YouTube 接続が完了しました。",
	}

	return a.youtubeConnection.snapshot
}

func (a *App) RestoreYouTubeConnection(channelTitle, channelID string) {
	a.youtubeConnection.mu.Lock()
	defer a.youtubeConnection.mu.Unlock()

	channelLabel := "接続済みチャンネル"
	if channelTitle != "" {
		channelLabel = channelTitle
	}

	a.youtubeConnection.snapshot = YouTubeConnectionSnapshot{
		Connected:    true,
		Stage:        "connected",
		ChannelHint:  channelID,
		ChannelLabel: channelLabel,
		ConnectedAt:  time.Now().UTC().Format(time.RFC3339),
		LastEvent:    "保存済みトークンから接続を復元しました。",
	}
}
