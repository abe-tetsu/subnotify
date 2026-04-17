import { useEffect, useState } from "react";

import {
  checkBackendHealth,
  fetchYouTubeStatus,
  getMe,
  getOAuthStartUrl,
  getWorkerStatus,
  loadUserSettings,
  logout,
  saveUserSettings,
  sendTestEvent,
  startWorker,
  stopWorker,
  type BackendHealth,
  type Me,
  type YouTubeWorkspaceStatus,
} from "./api";
import {
  DEFAULT_API_BASE_URL,
  defaultSettings,
  workspaceSlug,
  type ConsoleSettings,
} from "./storage";

type TabId = "dashboard" | "test" | "settings";

const soundPresetOptions = [
  { value: "chime", label: "チャイム" },
  { value: "bell", label: "ベル" },
  { value: "pop", label: "ポップ" },
  { value: "none", label: "なし" },
];

const accentColorOptions = [
  { value: "#ef5b31", label: "オレンジ" },
  { value: "#e53e3e", label: "レッド" },
  { value: "#d53f8c", label: "ピンク" },
  { value: "#805ad5", label: "パープル" },
  { value: "#3182ce", label: "ブルー" },
  { value: "#0ea5e9", label: "スカイ" },
  { value: "#38a169", label: "グリーン" },
  { value: "#d69e2e", label: "ゴールド" },
];

const defaultYouTubeStatus: YouTubeWorkspaceStatus = {
  connected: false,
  stage: "not_connected",
  channelLabel: "未接続",
  oauthStartUrl: null,
  connectedAt: null,
  lastEvent: "",
  message: "",
};

function App() {
  const [apiBaseUrl] = useState(DEFAULT_API_BASE_URL);
  const [me, setMe] = useState<Me | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [settings, setSettings] = useState<ConsoleSettings>(defaultSettings(apiBaseUrl));
  const [savedSettings, setSavedSettings] = useState<ConsoleSettings>(defaultSettings(apiBaseUrl));
  const [backendHealth, setBackendHealth] = useState<BackendHealth>({
    ok: false, service: null, environment: null, message: "",
  });
  const [youtubeStatus, setYouTubeStatus] = useState<YouTubeWorkspaceStatus>(defaultYouTubeStatus);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [isSendingTestEvent, setIsSendingTestEvent] = useState(false);
  const [testEventMessage, setTestEventMessage] = useState<string | null>(null);
  const [testSubscriberName, setTestSubscriberName] = useState("テストユーザー");
  const [workerRunning, setWorkerRunning] = useState(false);
  const [workerMessage, setWorkerMessage] = useState<string | null>(null);

  const hasUnsavedChanges =
    settings.overlayBaseUrl !== savedSettings.overlayBaseUrl ||
    settings.namedMessageTemplate !== savedSettings.namedMessageTemplate ||
    settings.anonymousMessageTemplate !== savedSettings.anonymousMessageTemplate ||
    settings.accentColor !== savedSettings.accentColor ||
    settings.displayDurationSec !== savedSettings.displayDurationSec ||
    settings.pollingIntervalSec !== savedSettings.pollingIntervalSec ||
    settings.soundPreset !== savedSettings.soundPreset ||
    settings.soundVolume !== savedSettings.soundVolume ||
    settings.avatarDataUrl !== savedSettings.avatarDataUrl;

  const testOverlayUrl = (() => {
    const base = savedSettings.overlayBaseUrl.trim().replace(/\/+$/, "") || "http://localhost:5173";
    const api = apiBaseUrl.trim().replace(/\/+$/, "");
    return `${base}/live/${workspaceSlug(savedSettings)}?api=${encodeURIComponent(api)}`;
  })();

  // 初期化: ログイン状態チェック + 設定読み込み
  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      // URL の ?auth=ok をクリーンアップ
      const params = new URLSearchParams(window.location.search);
      if (params.has("auth")) {
        params.delete("auth");
        const qs = params.toString();
        window.history.replaceState({}, "", window.location.pathname + (qs ? `?${qs}` : ""));
      }

      const user = await getMe(apiBaseUrl);
      if (cancelled) return;
      setMe(user);
      setIsCheckingAuth(false);

      if (!user) return;

      const health = await checkBackendHealth(apiBaseUrl);
      if (cancelled) return;
      setBackendHealth(health);

      const serverSettings = await loadUserSettings(apiBaseUrl);
      if (cancelled) return;

      if (serverSettings) {
        // サーバーから取得した設定をマージ（apiBaseUrl は常に現在の値を使う）
        const merged = { ...defaultSettings(apiBaseUrl), ...serverSettings, apiBaseUrl };
        setSettings(merged);
        setSavedSettings(merged);
      } else {
        // 初回: デフォルト設定を保存
        const fresh = defaultSettings(apiBaseUrl);
        setSettings(fresh);
        setSavedSettings(fresh);
        await saveUserSettings(apiBaseUrl, fresh);
      }

      const yt = await fetchYouTubeStatus(apiBaseUrl);
      if (!cancelled) setYouTubeStatus(yt);
    };

    void init();
    return () => { cancelled = true; };
  }, [apiBaseUrl]);

  // ワーカーステータスのポーリング
  useEffect(() => {
    if (!me) return;
    let cancelled = false;

    const loadWorker = async () => {
      const status = await getWorkerStatus(savedSettings);
      if (!cancelled) setWorkerRunning(status.running);
    };
    void loadWorker();
    const id = window.setInterval(() => void loadWorker(), 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [me, savedSettings]);

  const handleLogin = () => {
    window.location.href = getOAuthStartUrl(apiBaseUrl);
  };

  const handleLogout = async () => {
    await logout(apiBaseUrl);
    setMe(null);
  };

  const handleStartWorker = async () => {
    const result = await startWorker(savedSettings);
    setWorkerRunning(result.running);
    setWorkerMessage(result.message);
  };

  const handleStopWorker = async () => {
    const result = await stopWorker(savedSettings);
    setWorkerRunning(result.running);
    setWorkerMessage(result.message);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsMessage("設定を保存しています...");
    try {
      const ok = await saveUserSettings(apiBaseUrl, settings);
      if (!ok) throw new Error("サーバーへの保存に失敗");
      setSavedSettings(settings);
      setSettingsMessage("設定を保存しました。");
    } catch (error) {
      setSettingsMessage(`保存に失敗: ${String(error)}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleSendTestEvent = async (kind: "new_subscriber" | "new_anonymous_subscriber") => {
    setIsSendingTestEvent(true);
    setTestEventMessage(null);
    try {
      const result = await sendTestEvent(savedSettings, testSubscriberName, kind);
      setTestEventMessage(result.message);
    } catch (error) {
      setTestEventMessage(`送信に失敗: ${String(error)}`);
    } finally {
      setIsSendingTestEvent(false);
    }
  };

  const handleAvatarUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setSettings((c) => ({ ...c, avatarDataUrl: dataUrl }));
    };
    reader.readAsDataURL(file);
  };

  const handleAvatarRemove = () => {
    setSettings((c) => ({ ...c, avatarDataUrl: "" }));
  };

  if (isCheckingAuth) {
    return (
      <main className="app-shell">
        <section className="hero-card">
          <p className="hint-text">認証状態を確認中...</p>
        </section>
      </main>
    );
  }

  if (!me) {
    return (
      <main className="app-shell">
        <section className="hero-card">
          <div className="hero-copy">
            <p className="eyebrow">チャンネル登録通知</p>
            <h1>Subnotify</h1>
            <p className="hero-text">
              YouTube のチャンネル登録通知を OBS オーバーレイとして表示します。
            </p>
            <p className="panel-text">
              Google アカウントでログインすると、どのブラウザからでも同じ設定で利用できます。
            </p>
            <div className="action-row">
              <button className="worker-start-button" onClick={handleLogin} type="button">
                Google でログイン
              </button>
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">チャンネル登録通知</p>
          <h1>Subnotify</h1>
          <p className="hero-text">
            YouTube のチャンネル登録通知を OBS オーバーレイとして表示します。
          </p>
          <p className="hint-text">ログイン中: {me.email}</p>
          <div className="action-row">
            <button className="secondary-button" onClick={() => void handleLogout()} type="button">
              ログアウト
            </button>
          </div>
        </div>

        <div className="hero-status">
          <div className="status-pill">
            <span className={`status-dot ${workerRunning ? "is-ready" : ""}`} />
            {workerRunning ? "監視中" : "待機中"}
          </div>
          <p className="status-help">
            {workerRunning
              ? "チャンネル登録者をポーリング中です。新規登録を検出すると通知します。"
              : "ポーリングを開始すると、チャンネル登録の監視が始まります。"}
          </p>
          <div className="action-row">
            {workerRunning ? (
              <button className="worker-stop-button" onClick={() => void handleStopWorker()} type="button">
                ポーリング停止
              </button>
            ) : (
              <button className="worker-start-button" onClick={() => void handleStartWorker()} type="button">
                ポーリング開始
              </button>
            )}
          </div>
          {workerMessage ? <p className="status-help">{workerMessage}</p> : null}
        </div>
      </section>

      <nav className="tab-bar">
        <button className={`tab-button ${activeTab === "dashboard" ? "is-active" : ""}`} onClick={() => setActiveTab("dashboard")} type="button">
          ダッシュボード
        </button>
        <button className={`tab-button ${activeTab === "test" ? "is-active" : ""}`} onClick={() => setActiveTab("test")} type="button">
          テスト
        </button>
        <button className={`tab-button ${activeTab === "settings" ? "is-active" : ""}`} onClick={() => setActiveTab("settings")} type="button">
          設定
        </button>
      </nav>

      <div className="tab-content">
        {activeTab === "dashboard" ? (
          <section className="dashboard-grid">
            <article className="panel-card">
              <p className="panel-label">YouTube 接続</p>
              <h2>{youtubeStatus.connected ? "接続済み" : "未接続"}</h2>

              <div className="settings-preview">
                <div className="setting-row">
                  <span>接続状態</span>
                  <strong>
                    {youtubeStatus.connected
                      ? "接続済み"
                      : youtubeStatus.stage === "auth_started"
                        ? "ログイン待機中"
                        : "未接続"}
                  </strong>
                </div>
                <div className="setting-row">
                  <span>チャンネル</span>
                  <strong>{youtubeStatus.channelLabel}</strong>
                </div>
              </div>

              {youtubeStatus.lastEvent ? (
                <p className="hint-text">{youtubeStatus.lastEvent}</p>
              ) : null}
            </article>

            <article className="panel-card">
              <p className="panel-label">OBS ブラウザソース</p>
              <h2>オーバーレイ URL</h2>
              <div className="url-box">
                <code>{testOverlayUrl}</code>
              </div>

              <p className="field-label">設定手順</p>
              <div className="settings-preview">
                <div className="setting-row">
                  <span>Step 1</span>
                  <strong>OBS の「ソース」パネルで + ボタンをクリック</strong>
                </div>
                <div className="setting-row">
                  <span>Step 2</span>
                  <strong>「ブラウザ」を選択</strong>
                </div>
                <div className="setting-row">
                  <span>Step 3</span>
                  <strong>任意の名前（例: Subnotify）を入力して OK</strong>
                </div>
                <div className="setting-row">
                  <span>Step 4</span>
                  <strong>URL 欄に上のオーバーレイ URL を貼り付け</strong>
                </div>
              </div>
              <p className="hint-text">
                この URL は OBS 向けに透明背景です。配信画面の上にそのまま重ねて使えます。
              </p>
            </article>

            <article className="panel-card wide-card">
              <p className="panel-label">バックエンド</p>
              <h2>API 接続状態</h2>
              <div className="settings-preview">
                <div className="setting-row">
                  <span>状態</span>
                  <strong>{backendHealth.ok ? "接続成功" : "未接続"}</strong>
                </div>
                <div className="setting-row">
                  <span>API URL</span>
                  <strong>{apiBaseUrl}</strong>
                </div>
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "test" ? (
          <section className="dashboard-grid single-column">
            <article className="panel-card accent-card">
              <p className="panel-label">テスト通知</p>
              <h2>オーバーレイにテスト通知を送る</h2>
              <p className="panel-text">
                オーバーレイをブラウザで開いた状態でテスト通知を送ると、通知カードの表示を確認できます。
              </p>

              <div className="settings-form">
                <label className="field-group">
                  <span className="field-label">オーバーレイ URL</span>
                  <div className="url-box">
                    <code>{testOverlayUrl}</code>
                  </div>
                </label>

                <div className="action-row">
                  <button className="secondary-button" onClick={() => window.open(testOverlayUrl, "_blank")} type="button">
                    ブラウザで開く
                  </button>
                </div>

                <label className="field-group">
                  <span className="field-label">テスト登録者名</span>
                  <input
                    className="field-input"
                    onChange={(event) => setTestSubscriberName(event.currentTarget.value)}
                    type="text"
                    value={testSubscriberName}
                  />
                </label>

                <div className="action-row">
                  <button
                    className={`secondary-button ${isSendingTestEvent ? "is-disabled" : ""}`}
                    disabled={isSendingTestEvent}
                    onClick={() => void handleSendTestEvent("new_subscriber")}
                    type="button"
                  >
                    {isSendingTestEvent ? "送信中..." : "名前あり通知"}
                  </button>
                  <button
                    className={`secondary-button ${isSendingTestEvent ? "is-disabled" : ""}`}
                    disabled={isSendingTestEvent}
                    onClick={() => void handleSendTestEvent("new_anonymous_subscriber")}
                    type="button"
                  >
                    匿名通知
                  </button>
                </div>
              </div>

              {testEventMessage ? (
                <p className={testEventMessage.includes("失敗") ? "error-text" : "success-text"}>
                  {testEventMessage}
                </p>
              ) : null}
            </article>
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="dashboard-grid single-column">
            <article className="panel-card">
              <p className="panel-label">通知メッセージ設定</p>

              <div className="settings-form">
                <label className="field-group">
                  <span className="field-label">名前あり通知のメッセージ</span>
                  <p className="hint-text">{"{subscriber}"} が登録者名に置換されます。</p>
                  <textarea
                    className="field-input field-textarea"
                    onChange={(e) => { const v = e.currentTarget.value; setSettings((c) => ({ ...c, namedMessageTemplate: v })); }}
                    rows={3}
                    value={settings.namedMessageTemplate}
                  />
                </label>

                <label className="field-group">
                  <span className="field-label">匿名通知のメッセージ</span>
                  <textarea
                    className="field-input field-textarea"
                    onChange={(e) => { const v = e.currentTarget.value; setSettings((c) => ({ ...c, anonymousMessageTemplate: v })); }}
                    rows={3}
                    value={settings.anonymousMessageTemplate}
                  />
                </label>
              </div>
            </article>

            <article className="panel-card">
              <p className="panel-label">通知デザイン設定</p>

              <div className="settings-form">
                <div className="field-group">
                  <span className="field-label">アクセントカラー</span>
                  <div className="color-swatch-row">
                    {accentColorOptions.map((option) => (
                      <button
                        key={option.value}
                        aria-label={option.label}
                        aria-pressed={settings.accentColor === option.value}
                        className={`color-swatch ${settings.accentColor === option.value ? "is-selected" : ""}`}
                        onClick={() => setSettings((c) => ({ ...c, accentColor: option.value }))}
                        style={{ background: option.value }}
                        title={option.label}
                        type="button"
                      />
                    ))}
                  </div>
                </div>

                <div className="field-group">
                  <span className="field-label">アバター画像</span>
                  <div className="avatar-upload-row">
                    {settings.avatarDataUrl ? (
                      <img alt="アバター" className="avatar-preview" src={settings.avatarDataUrl} />
                    ) : null}
                    <label className="secondary-button avatar-upload-button">
                      画像を選択
                      <input
                        accept="image/*"
                        className="avatar-file-input"
                        onChange={(event) => {
                          const file = event.currentTarget.files?.[0];
                          if (!file) return;
                          handleAvatarUpload(file);
                          event.currentTarget.value = "";
                        }}
                        type="file"
                      />
                    </label>
                    <button
                      className="secondary-button"
                      onClick={handleAvatarRemove}
                      type="button"
                    >
                      削除
                    </button>
                  </div>
                  <p className="hint-text">通知カードのイニシャルアバターが画像に変わります。</p>
                </div>

                <label className="field-group">
                  <span className="field-label">表示時間（秒）</span>
                  <div className="segmented-control">
                    {[3, 5, 6, 8, 10].map((option) => (
                      <button
                        key={option}
                        aria-pressed={settings.displayDurationSec === option}
                        className={`segment-button ${settings.displayDurationSec === option ? "is-selected" : ""}`}
                        onClick={() => setSettings((c) => ({ ...c, displayDurationSec: option }))}
                        type="button"
                      >
                        {option} 秒
                      </button>
                    ))}
                  </div>
                </label>

                <label className="field-group">
                  <span className="field-label">ポーリング間隔（秒）</span>
                  <div className="segmented-control">
                    {[10, 15, 30, 60].map((option) => (
                      <button
                        key={option}
                        aria-pressed={settings.pollingIntervalSec === option}
                        className={`segment-button ${settings.pollingIntervalSec === option ? "is-selected" : ""}`}
                        onClick={() => setSettings((c) => ({ ...c, pollingIntervalSec: option }))}
                        type="button"
                      >
                        {option} 秒
                      </button>
                    ))}
                  </div>
                  <p className="hint-text">YouTube API に問い合わせる間隔です。短いほどリアルタイムに近づきますが、API クォータを消費します。</p>
                </label>
              </div>
            </article>

            <article className="panel-card">
              <p className="panel-label">通知音設定</p>

              <div className="settings-form">
                <label className="field-group">
                  <span className="field-label">通知音</span>
                  <div className="segmented-control">
                    {soundPresetOptions.map((option) => (
                      <button
                        key={option.value}
                        aria-pressed={settings.soundPreset === option.value}
                        className={`segment-button ${settings.soundPreset === option.value ? "is-selected" : ""}`}
                        onClick={() => setSettings((c) => ({ ...c, soundPreset: option.value }))}
                        type="button"
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </label>

                <label className="field-group">
                  <span className="field-label">音量 ({Math.round(settings.soundVolume * 100)}%)</span>
                  <input
                    className="volume-slider"
                    max="1"
                    min="0"
                    onChange={(e) => {
                      const v = Number(e.currentTarget.value);
                      setSettings((c) => ({ ...c, soundVolume: v }));
                    }}
                    step="0.1"
                    type="range"
                    value={settings.soundVolume}
                  />
                </label>
              </div>
            </article>

            <article className="panel-card">
              <p className="panel-label">接続設定</p>

              <div className="settings-form">
                <div className="field-group">
                  <span className="field-label">ワークスペース ID</span>
                  <div className="url-box">
                    <code>{savedSettings.workspaceLabel}</code>
                  </div>
                  <p className="hint-text">Google アカウントごとに自動生成される一意のIDです。オーバーレイ URL に使われます。</p>
                </div>

                <label className="field-group">
                  <span className="field-label">Overlay Base URL</span>
                  <input
                    className="field-input"
                    onChange={(e) => { const v = e.currentTarget.value; setSettings((c) => ({ ...c, overlayBaseUrl: v })); }}
                    type="text"
                    value={settings.overlayBaseUrl}
                  />
                </label>
              </div>
            </article>

            <div className="action-row">
              <button
                className={`secondary-button ${(!hasUnsavedChanges || isSavingSettings) ? "is-disabled" : ""}`}
                disabled={!hasUnsavedChanges || isSavingSettings}
                onClick={() => void handleSaveSettings()}
                type="button"
              >
                {isSavingSettings ? "保存中..." : "設定を保存"}
              </button>
            </div>

            {settingsMessage ? <p className="hint-text">{settingsMessage}</p> : null}
          </section>
        ) : null}
      </div>
    </main>
  );
}

export default App;
