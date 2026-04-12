package httpapi

import (
	"context"
	"encoding/json"
	"fmt"
	"html"
	"log"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/abe-tetsu/subnotify/server/internal/app"
	"github.com/abe-tetsu/subnotify/server/internal/notify"
	"github.com/abe-tetsu/subnotify/server/internal/youtube"
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
	ConnectedAt   string   `json:"connectedAt"`
	LastEvent     string   `json:"lastEvent"`
	Guidance      []string `json:"guidance"`
}

type setCredentialsRequest struct {
	ClientID     string `json:"clientId"`
	ClientSecret string `json:"clientSecret"`
}

type setCredentialsResponse struct {
	OK      bool   `json:"ok"`
	Message string `json:"message"`
}

func NewRouter(application *app.App, opts ...any) http.Handler {
	var store *notify.Store
	var broker *notify.Broker
	for _, opt := range opts {
		switch v := opt.(type) {
		case *notify.Store:
			store = v
		case *notify.Broker:
			broker = v
		}
	}

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

	mux.HandleFunc("POST /v1/youtube/credentials", func(w http.ResponseWriter, r *http.Request) {
		var req setCredentialsRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, setCredentialsResponse{OK: false, Message: "リクエストの解析に失敗しました"})
			return
		}

		if strings.TrimSpace(req.ClientID) == "" || strings.TrimSpace(req.ClientSecret) == "" {
			writeJSON(w, http.StatusBadRequest, setCredentialsResponse{OK: false, Message: "クライアントIDとシークレットを入力してください"})
			return
		}

		redirectURL := application.BuildRedirectURL()
		oauth := youtube.NewOAuthService(
			strings.TrimSpace(req.ClientID),
			strings.TrimSpace(req.ClientSecret),
			redirectURL,
			application.Config.DataDir,
		)
		application.SetOAuth(oauth)

		writeJSON(w, http.StatusOK, setCredentialsResponse{OK: true, Message: "OAuth クレデンシャルを設定しました"})
	})

	mux.HandleFunc("GET /v1/youtube/connection", func(w http.ResponseWriter, r *http.Request) {
		channelHint := strings.TrimSpace(r.URL.Query().Get("channel_hint"))
		snapshot := application.GetYouTubeConnection(channelHint)

		oauth := application.GetOAuth()
		if !snapshot.Connected && oauth != nil && oauth.HasToken() {
			info, err := oauth.FetchChannelInfo(context.Background())
			if err == nil {
				application.RestoreYouTubeConnection(info.Title, info.ID)
				snapshot = application.GetYouTubeConnection(channelHint)
			} else {
				log.Printf("[subnotify] トークンからの接続復元に失敗: %v", err)
			}
		}

		oauthStartURL := buildURL(
			application.Config.PublicBaseURL,
			application.Config.YouTubeAuthPath,
			channelHint,
		)

		guidance := guidanceForStage(snapshot)

		writeJSON(w, http.StatusOK, youtubeConnectionResponse{
			Connected:     snapshot.Connected,
			Stage:         snapshot.Stage,
			ChannelHint:   snapshot.ChannelHint,
			ChannelLabel:  snapshot.ChannelLabel,
			OAuthStartURL: oauthStartURL,
			ConnectedAt:   snapshot.ConnectedAt,
			LastEvent:     snapshot.LastEvent,
			Guidance:      guidance,
		})
	})

	mux.HandleFunc("GET /v1/youtube/auth/start", func(w http.ResponseWriter, r *http.Request) {
		channelHint := strings.TrimSpace(r.URL.Query().Get("channel_hint"))

		oauth := application.GetOAuth()
		if oauth == nil {
			renderErrorHTML(w, "OAuth が設定されていません", "デスクトップアプリの設定タブでクライアントIDとシークレットを入力してください。")
			return
		}

		state := application.GenerateOAuthState()
		application.StartYouTubeAuth(channelHint)

		authURL := oauth.AuthURL(state)
		http.Redirect(w, r, authURL, http.StatusFound)
	})

	mux.HandleFunc("GET /v1/youtube/auth/callback", func(w http.ResponseWriter, r *http.Request) {
		if errParam := r.URL.Query().Get("error"); errParam != "" {
			renderErrorHTML(w, "認可が中断されました", fmt.Sprintf("Google から返されたエラー: %s", errParam))
			return
		}

		state := r.URL.Query().Get("state")
		if !application.ValidateOAuthState(state) {
			renderErrorHTML(w, "認証エラー", "state パラメータの検証に失敗しました。もう一度やり直してください。")
			return
		}

		code := r.URL.Query().Get("code")
		if code == "" {
			renderErrorHTML(w, "認証エラー", "認可コードが返されませんでした。")
			return
		}

		oauth := application.GetOAuth()
		if oauth == nil {
			renderErrorHTML(w, "OAuth が設定されていません", "クレデンシャルが設定されていません。")
			return
		}

		token, err := oauth.Exchange(r.Context(), code)
		if err != nil {
			renderErrorHTML(w, "トークン交換に失敗", err.Error())
			return
		}

		if err := oauth.SaveToken(token); err != nil {
			renderErrorHTML(w, "トークン保存に失敗", err.Error())
			return
		}

		channelTitle := ""
		channelID := ""
		info, err := oauth.FetchChannelInfo(r.Context())
		if err != nil {
			log.Printf("[subnotify] チャンネル情報取得に失敗（トークンは保存済み）: %v", err)
			channelTitle = "Unknown Channel"
		} else {
			channelTitle = info.Title
			channelID = info.ID
		}

		application.CompleteYouTubeAuth(channelTitle, channelID)
		renderSuccessHTML(w, channelTitle)
	})

	mux.HandleFunc("POST /v1/test-event", func(w http.ResponseWriter, r *http.Request) {
		if broker == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "event broker not configured"})
			return
		}

		var req struct {
			SubscriberName string `json:"subscriberName"`
		}
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request"})
			return
		}

		name := req.SubscriberName
		if name == "" {
			name = "テストユーザー"
		}

		event := notify.NewSubscriberEvent(youtube.Subscriber{
			ChannelID: "test-channel",
			Title:     name,
		})

		broker.Publish(event)

		if store != nil {
			_ = store.AppendEvents([]notify.NotifyEvent{event})
		}

		log.Printf("test event sent: %s", name)
		writeJSON(w, http.StatusOK, map[string]any{"ok": true, "event": event})
	})

	mux.HandleFunc("GET /v1/events/poll", func(w http.ResponseWriter, r *http.Request) {
		if broker == nil {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "event broker not configured"})
			return
		}

		sinceStr := r.URL.Query().Get("since")
		var since uint64
		if sinceStr != "" {
			fmt.Sscanf(sinceStr, "%d", &since)
		}

		events, nextSeq := broker.Poll(since)
		writeJSON(w, http.StatusOK, map[string]any{
			"events":  events,
			"nextSeq": nextSeq,
		})
	})

	mux.HandleFunc("GET /v1/events/stream", func(w http.ResponseWriter, r *http.Request) {
		if broker == nil {
			http.Error(w, "event broker not configured", http.StatusServiceUnavailable)
			return
		}

		flusher, ok := w.(http.Flusher)
		if !ok {
			http.Error(w, "streaming not supported", http.StatusInternalServerError)
			return
		}

		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("Access-Control-Allow-Origin", "*")
		flusher.Flush()

		ch := broker.Subscribe()
		defer broker.Unsubscribe(ch)

		keepalive := time.NewTicker(15 * time.Second)
		defer keepalive.Stop()

		for {
			select {
			case <-r.Context().Done():
				return
			case <-keepalive.C:
				fmt.Fprintf(w, ":keepalive\n\n")
				flusher.Flush()
			case event := <-ch:
				data, err := json.Marshal(event)
				if err != nil {
					continue
				}
				fmt.Fprintf(w, "data: %s\n\n", data)
				flusher.Flush()
			}
		}
	})

	return corsMiddleware(mux)
}

func guidanceForStage(snapshot app.YouTubeConnectionSnapshot) []string {
	switch {
	case snapshot.Connected:
		return []string{
			"YouTube 接続が完了しています",
			"登録者のポーリングを開始できます",
			"desktop の更新ボタンで接続状態を再取得できます",
		}
	case snapshot.Stage == "auth_started":
		return []string{
			"ブラウザ側で Google 認可を完了してください",
			"desktop に戻って YouTube 状態を再確認してください",
			"接続済みになったら登録者ポーリングが有効になります",
		}
	default:
		return []string{
			"desktop から接続を開始してください",
			"OAuth 開始URLを開いて Google 認可を完了してください",
			"登録者監視が有効になったらダッシュボードに反映されます",
		}
	}
}

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, statusCode int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(statusCode)

	if err := json.NewEncoder(w).Encode(payload); err != nil {
		http.Error(w, `{"ok":false}`, http.StatusInternalServerError)
	}
}

func renderSuccessHTML(w http.ResponseWriter, channelTitle string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	document := fmt.Sprintf(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Subnotify YouTube Connected</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: #10233d;
        background:
          radial-gradient(circle at top left, rgba(214, 255, 227, 0.92), transparent 30%%%%),
          linear-gradient(145deg, #fff8ef 0%%%%, #f3fbf7 48%%%%, #eef7ff 100%%%%);
      }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .card {
        width: min(760px, 100%%%%);
        padding: 32px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(16, 35, 61, 0.08);
        box-shadow: 0 18px 60px rgba(39, 62, 102, 0.12);
      }
      .pill {
        display: inline-flex; align-items: center; gap: 10px;
        min-height: 38px; padding: 0 14px; border-radius: 999px;
        background: rgba(89, 212, 139, 0.14); color: #1f7a46; font-weight: 700;
      }
      .dot { width: 10px; height: 10px; border-radius: 999px; background: #59d48b; }
      p { color: #52637a; line-height: 1.6; }
      .mono {
        padding: 12px 14px; border-radius: 16px;
        background: rgba(16, 35, 61, 0.04);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="pill"><span class="dot"></span>Connected</div>
      <h1>YouTube 接続が完了しました</h1>
      <p>このタブは閉じて大丈夫です。desktop アプリに戻ると自動で接続済みに切り替わります。</p>
      <p><strong>Channel</strong></p>
      <p class="mono">%s</p>
    </main>
  </body>
</html>`, html.EscapeString(channelTitle))

	_, _ = w.Write([]byte(document))
}

func renderErrorHTML(w http.ResponseWriter, title string, message string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	document := fmt.Sprintf(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Subnotify Error</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: #10233d;
        background: linear-gradient(145deg, #fff4e8 0%%%%, #f4f8ff 48%%%%, #eef7f3 100%%%%);
      }
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; }
      .card {
        width: min(760px, 100%%%%);
        padding: 32px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.86);
        border: 1px solid rgba(16, 35, 61, 0.08);
        box-shadow: 0 18px 60px rgba(39, 62, 102, 0.12);
      }
      h1 { margin: 0 0 12px; }
      p { color: #52637a; line-height: 1.6; }
      .error-text { color: #b1402d; }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>%s</h1>
      <p class="error-text">%s</p>
      <p>desktop アプリから再度お試しください。</p>
    </main>
  </body>
</html>`, html.EscapeString(title), html.EscapeString(message))

	_, _ = w.Write([]byte(document))
}

func buildURL(baseURL string, path string, channelHint string) string {
	fullURL := strings.TrimRight(baseURL, "/") + path
	if channelHint == "" {
		return fullURL
	}

	return fullURL + "?channel_hint=" + url.QueryEscape(channelHint)
}
