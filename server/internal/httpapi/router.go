package httpapi

import (
	"encoding/json"
	"fmt"
	"html"
	"net/http"
	"net/url"
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
	ConnectedAt   string   `json:"connectedAt"`
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
		snapshot := application.GetYouTubeConnection(channelHint)
		oauthStartURL := buildURL(
			application.Config.PublicBaseURL,
			application.Config.YouTubeAuthPath,
			channelHint,
		)
		guidance := []string{
			"desktop から接続を開始したら backend の OAuth 開始 URL を開く",
			"認可完了後に接続済みのチャンネル情報を返す",
			"登録者監視が有効になったら dashboard に反映する",
		}
		if snapshot.Stage == "auth_started" {
			guidance = []string{
				"ブラウザ側で認可完了まで進める",
				"desktop に戻って YouTube 状態を再確認する",
				"接続済みになったら次は polling と overlay をつなぐ",
			}
		}
		if snapshot.Connected {
			guidance = []string{
				"YouTube 接続は仮状態で完了しています",
				"次の実装で token 保存とチャンネル情報取得に置き換える",
				"desktop の更新ボタンで接続状態を再取得できる",
			}
		}

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
		application.StartYouTubeAuth(channelHint)
		renderYouTubeAuthScaffold(
			w,
			channelHint,
			buildURL(
				application.Config.PublicBaseURL,
				application.Config.YouTubeAuthCallbackPath,
				channelHint,
			),
		)
	})

	mux.HandleFunc("GET /v1/youtube/auth/callback", func(w http.ResponseWriter, r *http.Request) {
		channelHint := strings.TrimSpace(r.URL.Query().Get("channel_hint"))
		snapshot := application.CompleteYouTubeAuth(channelHint)
		renderYouTubeAuthCallbackScaffold(w, snapshot.ChannelLabel)
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

func renderYouTubeAuthScaffold(w http.ResponseWriter, channelHint string, callbackURL string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusOK)

	channelLine := "未指定"
	if channelHint != "" {
		channelLine = channelHint
	}

	document := fmt.Sprintf(`<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Subnotify YouTube Auth</title>
    <style>
      :root {
        color-scheme: light;
        font-family: "Avenir Next", "Segoe UI", sans-serif;
        color: #10233d;
        background:
          radial-gradient(circle at top left, rgba(255, 234, 210, 0.95), transparent 34%%),
          linear-gradient(145deg, #fff4e8 0%%, #f4f8ff 48%%, #eef7f3 100%%);
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(760px, 100%%);
        padding: 32px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.86);
        border: 1px solid rgba(16, 35, 61, 0.08);
        box-shadow: 0 18px 60px rgba(39, 62, 102, 0.12);
      }
      .eyebrow {
        margin: 0 0 10px;
        font-size: 0.75rem;
        letter-spacing: 0.14em;
        text-transform: uppercase;
        color: #a8562a;
      }
      h1 {
        margin: 0 0 12px;
        font-size: clamp(2rem, 5vw, 3rem);
        letter-spacing: -0.03em;
      }
      p, li {
        color: #52637a;
        line-height: 1.6;
      }
      .mono {
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(16, 35, 61, 0.04);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        word-break: break-word;
      }
      .button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 46px;
        padding: 0 18px;
        border-radius: 14px;
        color: #10233d;
        background: rgba(255, 255, 255, 0.92);
        box-shadow: 0 10px 24px rgba(12, 40, 72, 0.18);
        font-weight: 700;
        text-decoration: none;
      }
      ul {
        padding-left: 20px;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <p class="eyebrow">Subnotify YouTube Auth</p>
      <h1>OAuth 開始ページの雛形です</h1>
      <p>ここは今後 YouTube 認可フローの入口になります。まだ本認証は未実装ですが、desktop から接続導線を確認できる状態にしています。</p>
      <p><strong>Channel Hint</strong></p>
      <p class="mono">%s</p>
      <ul>
        <li>次の実装で Google OAuth の開始 URL へリダイレクトします。</li>
        <li>認可完了後は backend が接続済みチャンネル情報を保存します。</li>
        <li>desktop はこの結果を再取得して接続状態カードへ反映します。</li>
      </ul>
      <p><a class="button" href="%s">認可完了をシミュレートする</a></p>
    </main>
  </body>
</html>`, html.EscapeString(channelLine), html.EscapeString(callbackURL))

	_, _ = w.Write([]byte(document))
}

func renderYouTubeAuthCallbackScaffold(w http.ResponseWriter, channelLabel string) {
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
          radial-gradient(circle at top left, rgba(214, 255, 227, 0.92), transparent 30%%),
          linear-gradient(145deg, #fff8ef 0%%, #f3fbf7 48%%, #eef7ff 100%%);
      }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
      }
      .card {
        width: min(760px, 100%%);
        padding: 32px;
        border-radius: 28px;
        background: rgba(255, 255, 255, 0.88);
        border: 1px solid rgba(16, 35, 61, 0.08);
        box-shadow: 0 18px 60px rgba(39, 62, 102, 0.12);
      }
      .pill {
        display: inline-flex;
        align-items: center;
        gap: 10px;
        min-height: 38px;
        padding: 0 14px;
        border-radius: 999px;
        background: rgba(89, 212, 139, 0.14);
        color: #1f7a46;
        font-weight: 700;
      }
      .dot {
        width: 10px;
        height: 10px;
        border-radius: 999px;
        background: #59d48b;
      }
      .mono {
        padding: 12px 14px;
        border-radius: 16px;
        background: rgba(16, 35, 61, 0.04);
        font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
        word-break: break-word;
      }
      p {
        color: #52637a;
        line-height: 1.6;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <div class="pill"><span class="dot"></span>Connected</div>
      <h1>YouTube 接続の仮完了ページです</h1>
      <p>backend 側の仮状態を「接続済み」に更新しました。desktop に戻って <strong>YouTube 状態を確認</strong> または <strong>状態を更新</strong> を押すと、接続済み表示へ切り替わります。</p>
      <p><strong>Channel</strong></p>
      <p class="mono">%s</p>
    </main>
  </body>
</html>`, html.EscapeString(channelLabel))

	_, _ = w.Write([]byte(document))
}

func buildURL(baseURL string, path string, channelHint string) string {
	fullURL := strings.TrimRight(baseURL, "/") + path
	if channelHint == "" {
		return fullURL
	}

	return fullURL + "?channel_hint=" + url.QueryEscape(channelHint)
}
