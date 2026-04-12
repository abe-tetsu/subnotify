package app

import (
	"sync"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/config"
)

const (
	Name    = "subnotify-server"
	Version = "0.1.0"
)

type App struct {
	Config            config.Config
	youtubeConnection *YouTubeConnectionStore
}

func New(cfg config.Config) App {
	return App{
		Config:            cfg,
		youtubeConnection: NewYouTubeConnectionStore(),
	}
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
	mu       sync.Mutex
	snapshot YouTubeConnectionSnapshot
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

func (a App) GetYouTubeConnection(channelHint string) YouTubeConnectionSnapshot {
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

func (a App) StartYouTubeAuth(channelHint string) YouTubeConnectionSnapshot {
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
		LastEvent:    "OAuth 開始ページを開きました。認可完了を待っています。",
	}

	return a.youtubeConnection.snapshot
}

func (a App) CompleteYouTubeAuth(channelHint string) YouTubeConnectionSnapshot {
	a.youtubeConnection.mu.Lock()
	defer a.youtubeConnection.mu.Unlock()

	channelLabel := "接続済みチャンネル"
	if channelHint != "" {
		channelLabel = channelHint
	}

	a.youtubeConnection.snapshot = YouTubeConnectionSnapshot{
		Connected:    true,
		Stage:        "connected",
		ChannelHint:  channelHint,
		ChannelLabel: channelLabel,
		ConnectedAt:  time.Now().UTC().Format(time.RFC3339),
		LastEvent:    "OAuth 認可を完了しました。YouTube 接続は仮状態で有効です。",
	}

	return a.youtubeConnection.snapshot
}
