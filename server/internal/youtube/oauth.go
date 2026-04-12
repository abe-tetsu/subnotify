package youtube

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"sync"

	"golang.org/x/oauth2"
	"golang.org/x/oauth2/google"
)

const (
	youtubeReadOnlyScope = "https://www.googleapis.com/auth/youtube.readonly"
	tokenFileName        = "youtube_token.json"
)

type ChannelInfo struct {
	ID    string
	Title string
}

type OAuthProvider interface {
	AuthURL(state string) string
	Exchange(ctx context.Context, code string) (*oauth2.Token, error)
	SaveToken(token *oauth2.Token) error
	LoadToken() (*oauth2.Token, error)
	HasToken() bool
	FetchChannelInfo(ctx context.Context) (ChannelInfo, error)
	FetchMySubscribers(ctx context.Context) ([]Subscriber, error)
	FetchSubscriberCount(ctx context.Context) (int, error)
}

type OAuthService struct {
	config  oauth2.Config
	dataDir string
	mu      sync.Mutex
}

func NewOAuthService(clientID, clientSecret, redirectURL, dataDir string) *OAuthService {
	if err := os.MkdirAll(dataDir, 0700); err != nil {
		fmt.Fprintf(os.Stderr, "[subnotify] データディレクトリの作成に失敗: %v\n", err)
	}

	return &OAuthService{
		config: oauth2.Config{
			ClientID:     clientID,
			ClientSecret: clientSecret,
			Endpoint:     google.Endpoint,
			RedirectURL:  redirectURL,
			Scopes:       []string{youtubeReadOnlyScope},
		},
		dataDir: dataDir,
	}
}

func (s *OAuthService) AuthURL(state string) string {
	return s.config.AuthCodeURL(state,
		oauth2.AccessTypeOffline,
		oauth2.SetAuthURLParam("prompt", "consent"),
	)
}

func (s *OAuthService) Exchange(ctx context.Context, code string) (*oauth2.Token, error) {
	token, err := s.config.Exchange(ctx, code)
	if err != nil {
		return nil, fmt.Errorf("トークン交換に失敗: %w", err)
	}

	return token, nil
}

func (s *OAuthService) tokenFilePath() string {
	return filepath.Join(s.dataDir, tokenFileName)
}

func (s *OAuthService) SaveToken(token *oauth2.Token) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := json.MarshalIndent(token, "", "  ")
	if err != nil {
		return fmt.Errorf("トークンのシリアライズに失敗: %w", err)
	}

	tmpPath := s.tokenFilePath() + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return fmt.Errorf("トークンファイルの書き込みに失敗: %w", err)
	}

	if err := os.Rename(tmpPath, s.tokenFilePath()); err != nil {
		return fmt.Errorf("トークンファイルのリネームに失敗: %w", err)
	}

	return nil
}

func (s *OAuthService) LoadToken() (*oauth2.Token, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	data, err := os.ReadFile(s.tokenFilePath())
	if err != nil {
		return nil, err
	}

	var token oauth2.Token
	if err := json.Unmarshal(data, &token); err != nil {
		return nil, fmt.Errorf("トークンファイルの解析に失敗: %w", err)
	}

	return &token, nil
}

func (s *OAuthService) HasToken() bool {
	_, err := os.Stat(s.tokenFilePath())
	return err == nil
}

func (s *OAuthService) httpClient(ctx context.Context) (*http.Client, error) {
	token, err := s.LoadToken()
	if err != nil {
		return nil, fmt.Errorf("トークンの読み込みに失敗: %w", err)
	}

	tokenSource := s.config.TokenSource(ctx, token)

	refreshed, err := tokenSource.Token()
	if err != nil {
		return nil, fmt.Errorf("トークンの更新に失敗: %w", err)
	}

	if refreshed.AccessToken != token.AccessToken {
		if saveErr := s.SaveToken(refreshed); saveErr != nil {
			fmt.Fprintf(os.Stderr, "[subnotify] リフレッシュ後のトークン保存に失敗: %v\n", saveErr)
		}
	}

	return oauth2.NewClient(ctx, oauth2.StaticTokenSource(refreshed)), nil
}

type channelListResponse struct {
	Items []struct {
		ID      string `json:"id"`
		Snippet struct {
			Title string `json:"title"`
		} `json:"snippet"`
	} `json:"items"`
}

func (s *OAuthService) FetchChannelInfo(ctx context.Context) (ChannelInfo, error) {
	client, err := s.httpClient(ctx)
	if err != nil {
		return ChannelInfo{}, err
	}

	resp, err := client.Get("https://www.googleapis.com/youtube/v3/channels?part=id,snippet&mine=true")
	if err != nil {
		return ChannelInfo{}, fmt.Errorf("チャンネル情報の取得に失敗: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return ChannelInfo{}, fmt.Errorf("チャンネル情報の取得に失敗 (HTTP %d)", resp.StatusCode)
	}

	var result channelListResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return ChannelInfo{}, fmt.Errorf("チャンネル情報の解析に失敗: %w", err)
	}

	if len(result.Items) == 0 {
		return ChannelInfo{}, fmt.Errorf("チャンネルが見つかりませんでした")
	}

	return ChannelInfo{
		ID:    result.Items[0].ID,
		Title: result.Items[0].Snippet.Title,
	}, nil
}
