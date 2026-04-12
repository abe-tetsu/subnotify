import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";

import "./App.css";

type ServiceStatus = {
  label: string;
  state: "ready" | "planning" | "pending";
  detail: string;
};

type AlertMode = {
  title: string;
  behavior: string;
};

type DesktopOverview = {
  productName: string;
  stageLabel: string;
  summary: string;
  desktopStatus: ServiceStatus;
  serverStatus: ServiceStatus;
  overlayStatus: ServiceStatus;
  architecture: string[];
  alertModes: AlertMode[];
  nextMilestones: string[];
  notes: string[];
};

type DesktopSettings = {
  workspaceLabel: string;
  apiBaseUrl: string;
  overlayBaseUrl: string;
  youtubeChannelHint: string;
};

type BackendConnectionStatus = {
  ok: boolean;
  checkedAt: string;
  statusCode: number | null;
  service: string | null;
  environment: string | null;
  message: string;
};

type YouTubeWorkspaceStatus = {
  ok: boolean;
  checkedAt: string;
  connected: boolean;
  stage: string;
  channelHint: string;
  channelLabel: string;
  oauthStartUrl: string | null;
  connectedAt: string | null;
  lastEvent: string;
  guidance: string[];
  message: string;
};

type TabId = "dashboard" | "settings" | "architecture" | "roadmap";

const fallbackOverview: DesktopOverview = {
  productName: "Subnotify",
  stageLabel: "Desktop Shell",
  summary:
    "Subnotify v2 の最初の Tauri 画面です。ここからクラウドサーバー版の通知基盤へ広げていきます。",
  desktopStatus: {
    label: "Desktop",
    state: "ready",
    detail: "Tauri + React の土台を配置済みです。",
  },
  serverStatus: {
    label: "Server",
    state: "ready",
    detail: "Go API / worker 雛形に加えて YouTube auth の仮状態遷移まで実装済みです。",
  },
  overlayStatus: {
    label: "Overlay",
    state: "planning",
    detail: "OBS から読む公開 URL ベースの overlay を別アプリで用意します。",
  },
  architecture: [
    "Desktop は Tauri + React で管理画面を担当する",
    "Backend は Go で YouTube 連携と通知判定を担当する",
    "Overlay は公開 URL で配信ソフトから読み込む",
  ],
  alertModes: [
    {
      title: "名前あり通知",
      behavior: "公開登録者が取得できた場合は登録者名を表示する",
    },
    {
      title: "名前なし通知",
      behavior: "登録者数だけ増えて公開登録者が取れない場合は匿名通知に切り替える",
    },
  ],
  nextMilestones: [
    "YouTube OAuth 仮 callback 後の反映を desktop で自動更新できるようにする",
    "backend の YouTube 状態を永続化できるようにする",
    "overlay の v2 デザインを公開 URL 前提で組み直す",
  ],
  notes: [
    "v1 の local overlay server は使わない",
    "秘密情報は Git に入れず .env.local や環境変数で管理する",
    "今回の画面は v2 の作業ベースとして使う",
  ],
};

const fallbackSettings: DesktopSettings = {
  workspaceLabel: "Default Workspace",
  apiBaseUrl: "http://localhost:8080",
  overlayBaseUrl: "https://overlay.example.com/subnotify",
  youtubeChannelHint: "",
};

const fallbackBackendConnectionStatus: BackendConnectionStatus = {
  ok: false,
  checkedAt: "",
  statusCode: null,
  service: null,
  environment: null,
  message: "まだ接続確認していません。",
};

const fallbackYouTubeWorkspaceStatus: YouTubeWorkspaceStatus = {
  ok: false,
  checkedAt: "",
  connected: false,
  stage: "idle",
  channelHint: "",
  channelLabel: "未確認",
  oauthStartUrl: null,
  connectedAt: null,
  lastEvent: "まだ YouTube 状態を確認していません。",
  guidance: [
    "API Base URL を設定して backend 接続確認を先に済ませる",
    "チャンネルのヒントを入れて YouTube 状態を確認する",
  ],
  message: "まだ YouTube 状態を確認していません。",
};

function statusClassName(state: ServiceStatus["state"]) {
  switch (state) {
    case "ready":
      return "status-dot is-ready";
    case "planning":
      return "status-dot is-planning";
    default:
      return "status-dot";
  }
}

function isConfigured(value: string) {
  return value.trim().length > 0;
}

function canOpenOAuthStartUrl(status: YouTubeWorkspaceStatus) {
  return Boolean(status.oauthStartUrl && status.oauthStartUrl.trim() !== "");
}

function youtubeStatusLabel(status: YouTubeWorkspaceStatus) {
  if (status.connected) {
    return "接続済み";
  }
  if (status.stage === "auth_started") {
    return "認可待ち";
  }
  if (status.ok) {
    return "接続前";
  }
  return "未確認 / 失敗";
}

function youtubeStatusClassName(status: YouTubeWorkspaceStatus) {
  if (status.connected) {
    return "status-dot is-ready";
  }
  if (status.stage === "auth_started" || status.ok) {
    return "status-dot is-planning";
  }
  return "status-dot";
}

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("dashboard");
  const [overview, setOverview] = useState<DesktopOverview>(fallbackOverview);
  const [settings, setSettings] = useState<DesktopSettings>(fallbackSettings);
  const [savedSettings, setSavedSettings] = useState<DesktopSettings>(fallbackSettings);
  const [backendConnectionStatus, setBackendConnectionStatus] = useState<BackendConnectionStatus>(
    fallbackBackendConnectionStatus,
  );
  const [youtubeWorkspaceStatus, setYouTubeWorkspaceStatus] = useState<YouTubeWorkspaceStatus>(
    fallbackYouTubeWorkspaceStatus,
  );
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isLoadingSettings, setIsLoadingSettings] = useState(true);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [isCheckingBackend, setIsCheckingBackend] = useState(false);
  const [isCheckingYouTube, setIsCheckingYouTube] = useState(false);
  const [isOpeningOAuthPage, setIsOpeningOAuthPage] = useState(false);
  const [settingsMessage, setSettingsMessage] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);

  const hasUnsavedChanges =
    settings.workspaceLabel !== savedSettings.workspaceLabel ||
    settings.apiBaseUrl !== savedSettings.apiBaseUrl ||
    settings.overlayBaseUrl !== savedSettings.overlayBaseUrl ||
    settings.youtubeChannelHint !== savedSettings.youtubeChannelHint;

  const readinessItems = [
    {
      label: "API Base URL",
      value: settings.apiBaseUrl,
      ready: isConfigured(settings.apiBaseUrl),
      help: "Go backend の API 接続先です。",
    },
    {
      label: "Overlay Base URL",
      value: settings.overlayBaseUrl,
      ready: isConfigured(settings.overlayBaseUrl),
      help: "OBS で読む公開 overlay のベース URL です。",
    },
    {
      label: "Workspace Label",
      value: settings.workspaceLabel,
      ready: isConfigured(settings.workspaceLabel),
      help: "複数環境を見分けるための表示名です。",
    },
  ];

  useEffect(() => {
    let isMounted = true;

    const loadOverview = async () => {
      try {
        const nextOverview = await invoke<DesktopOverview>("get_desktop_overview");
        if (isMounted) {
          setOverview(nextOverview);
          setLastError(null);
        }
      } catch (error) {
        if (isMounted) {
          setLastError(`状態の取得に失敗しました: ${String(error)}`);
        }
      }
    };

    const loadSettings = async () => {
      try {
        const nextSettings = await invoke<DesktopSettings>("get_desktop_settings");
        if (!isMounted) {
          return;
        }

        setSettings(nextSettings);
        setSavedSettings(nextSettings);
        setSettingsMessage("保存済みの desktop 設定を読み込みました。");

        if (nextSettings.apiBaseUrl.trim() !== "") {
          const status = await invoke<BackendConnectionStatus>("check_backend_connection", {
            apiBaseUrl: nextSettings.apiBaseUrl,
          });
          const youtubeStatus = await invoke<YouTubeWorkspaceStatus>("get_youtube_workspace_status", {
            apiBaseUrl: nextSettings.apiBaseUrl,
            youtubeChannelHint: nextSettings.youtubeChannelHint,
          });
          if (isMounted) {
            setBackendConnectionStatus(status);
            setYouTubeWorkspaceStatus(youtubeStatus);
          }
        }
      } catch (error) {
        if (isMounted) {
          setSettingsMessage(`desktop 設定の取得に失敗しました: ${String(error)}`);
        }
      } finally {
        if (isMounted) {
          setIsLoadingSettings(false);
        }
      }
    };

    void loadOverview();
    void loadSettings();

    return () => {
      isMounted = false;
    };
  }, []);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      const nextOverview = await invoke<DesktopOverview>("get_desktop_overview");
      const nextSettings = await invoke<DesktopSettings>("get_desktop_settings");
      const nextConnectionStatus = await invoke<BackendConnectionStatus>("check_backend_connection", {
        apiBaseUrl: nextSettings.apiBaseUrl,
      });
      const nextYouTubeStatus = await invoke<YouTubeWorkspaceStatus>("get_youtube_workspace_status", {
        apiBaseUrl: nextSettings.apiBaseUrl,
        youtubeChannelHint: nextSettings.youtubeChannelHint,
      });

      setOverview(nextOverview);
      setSettings(nextSettings);
      setSavedSettings(nextSettings);
      setBackendConnectionStatus(nextConnectionStatus);
      setYouTubeWorkspaceStatus(nextYouTubeStatus);
      setLastError(null);
      setSettingsMessage("desktop 設定と状態を再取得しました。");
    } catch (error) {
      setLastError(`状態の再取得に失敗しました: ${String(error)}`);
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    setSettingsMessage("desktop 設定を保存しています...");

    try {
      const updated = await invoke<DesktopSettings>("update_desktop_settings", {
        settings,
      });
      setSettings(updated);
      setSavedSettings(updated);
      setSettingsMessage("desktop 設定を保存しました。");
      setLastError(null);
    } catch (error) {
      setSettingsMessage(`desktop 設定の保存に失敗しました: ${String(error)}`);
    } finally {
      setIsSavingSettings(false);
    }
  };

  const handleCheckBackendConnection = async (apiBaseUrl: string) => {
    setIsCheckingBackend(true);
    try {
      const status = await invoke<BackendConnectionStatus>("check_backend_connection", {
        apiBaseUrl,
      });
      setBackendConnectionStatus(status);
      setLastError(null);
    } catch (error) {
      setLastError(`backend 接続確認に失敗しました: ${String(error)}`);
    } finally {
      setIsCheckingBackend(false);
    }
  };

  const handleCheckYouTubeWorkspace = async (
    apiBaseUrl: string,
    youtubeChannelHint: string,
  ) => {
    setIsCheckingYouTube(true);
    try {
      const status = await invoke<YouTubeWorkspaceStatus>("get_youtube_workspace_status", {
        apiBaseUrl,
        youtubeChannelHint,
      });
      setYouTubeWorkspaceStatus(status);
      setLastError(null);
    } catch (error) {
      setLastError(`YouTube 状態の取得に失敗しました: ${String(error)}`);
    } finally {
      setIsCheckingYouTube(false);
    }
  };

  const handleOpenOAuthPage = async (url: string | null) => {
    if (!url || url.trim() === "") {
      return;
    }

    setIsOpeningOAuthPage(true);
    try {
      await openUrl(url);
      setLastError(null);
    } catch (error) {
      setLastError(`OAuth 開始ページを開けませんでした: ${String(error)}`);
    } finally {
      setIsOpeningOAuthPage(false);
    }
  };

  return (
    <main className="app-shell">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Cloud Notification Workspace</p>
          <h1>{overview.productName}</h1>
          <p className="hero-text">{overview.summary}</p>
        </div>

        <div className="hero-status">
          <div className="status-pill">
            <span className={statusClassName(overview.desktopStatus.state)} />
            {overview.stageLabel}
          </div>
          <p className="status-help">
            v1 の見た目を引き継ぎつつ、v2 のクラウド構成へ移るための最初の管理画面です。
          </p>
          <div className="hero-badges">
            <span className="meta-badge">{settings.workspaceLabel}</span>
            <span className="meta-badge">
              {isConfigured(settings.youtubeChannelHint)
                ? `Channel: ${settings.youtubeChannelHint}`
                : "Channel: 未設定"}
            </span>
          </div>
          <div className="action-row">
            <button
              className={`secondary-button ${isRefreshing ? "is-disabled" : ""}`}
              disabled={isRefreshing}
              onClick={() => void handleRefresh()}
              type="button"
            >
              {isRefreshing ? "更新中..." : "状態を更新"}
            </button>
          </div>
        </div>
      </section>

      <nav className="tab-bar">
        <button
          className={`tab-button ${activeTab === "dashboard" ? "is-active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
          type="button"
        >
          ダッシュボード
        </button>
        <button
          className={`tab-button ${activeTab === "settings" ? "is-active" : ""}`}
          onClick={() => setActiveTab("settings")}
          type="button"
        >
          設定
        </button>
        <button
          className={`tab-button ${activeTab === "architecture" ? "is-active" : ""}`}
          onClick={() => setActiveTab("architecture")}
          type="button"
        >
          構成
        </button>
        <button
          className={`tab-button ${activeTab === "roadmap" ? "is-active" : ""}`}
          onClick={() => setActiveTab("roadmap")}
          type="button"
        >
          ロードマップ
        </button>
      </nav>

      <div className="tab-content">
        {activeTab === "dashboard" ? (
          <section className="dashboard-grid">
            {[overview.desktopStatus, overview.serverStatus, overview.overlayStatus].map((item) => (
              <article className="panel-card" key={item.label}>
                <p className="panel-label">{item.label}</p>
                <h2>
                  {item.state === "ready"
                    ? "着手済み"
                    : item.state === "planning"
                      ? "設計中"
                      : "待機中"}
                </h2>
                <p className="panel-text">{item.detail}</p>
                <div className="status-row">
                  <span className={statusClassName(item.state)} />
                  <span className="status-inline-text">{item.label}</span>
                </div>
              </article>
            ))}

            <article className="panel-card wide-card">
              <p className="panel-label">Readiness</p>
              <h2>接続設定の準備状況</h2>
              <div className="stack-list">
                {readinessItems.map((item) => (
                  <div className="stack-item" key={item.label}>
                    <div className="status-row">
                      <span className={item.ready ? "status-dot is-ready" : "status-dot"} />
                      <span className="status-inline-text">{item.label}</span>
                    </div>
                    <p className="panel-text mono-text">
                      {item.value.trim() === "" ? "未設定" : item.value}
                    </p>
                    <p className="field-help">{item.help}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel-card wide-card">
              <p className="panel-label">Backend Health</p>
              <h2>Go backend の接続状態</h2>
              <div className="status-row">
                <span className={backendConnectionStatus.ok ? "status-dot is-ready" : "status-dot"} />
                <span className="status-inline-text">
                  {backendConnectionStatus.ok ? "接続成功" : "未接続 / 失敗"}
                </span>
              </div>
              <p className="panel-text">{backendConnectionStatus.message}</p>
              <div className="stack-list compact-stack">
                <div className="stack-item">
                  <strong>API Base URL</strong>
                  <p className="panel-text mono-text">{savedSettings.apiBaseUrl || "未設定"}</p>
                </div>
                <div className="stack-item">
                  <strong>Service</strong>
                  <p className="panel-text">{backendConnectionStatus.service || "-"}</p>
                </div>
                <div className="stack-item">
                  <strong>Environment</strong>
                  <p className="panel-text">{backendConnectionStatus.environment || "-"}</p>
                </div>
                <div className="stack-item">
                  <strong>Last Checked</strong>
                  <p className="panel-text">{backendConnectionStatus.checkedAt || "-"}</p>
                </div>
              </div>
              <div className="action-row">
                <button
                  className={`secondary-button ${isCheckingBackend ? "is-disabled" : ""}`}
                  disabled={isCheckingBackend}
                  onClick={() => void handleCheckBackendConnection(savedSettings.apiBaseUrl)}
                  type="button"
                >
                  {isCheckingBackend ? "確認中..." : "接続確認"}
                </button>
              </div>
            </article>

            <article className="panel-card wide-card">
              <p className="panel-label">YouTube Workspace</p>
              <h2>YouTube 接続フローの準備状況</h2>
              <div className="status-row">
                <span className={youtubeStatusClassName(youtubeWorkspaceStatus)} />
                <span className="status-inline-text">{youtubeStatusLabel(youtubeWorkspaceStatus)}</span>
              </div>
              <p className="panel-text">{youtubeWorkspaceStatus.message}</p>
              <div className="stack-list compact-stack">
                <div className="stack-item">
                  <strong>Channel</strong>
                  <p className="panel-text">{youtubeWorkspaceStatus.channelLabel}</p>
                </div>
                <div className="stack-item">
                  <strong>Stage</strong>
                  <p className="panel-text">{youtubeWorkspaceStatus.stage}</p>
                </div>
                <div className="stack-item">
                  <strong>OAuth Start URL</strong>
                  <p className="panel-text mono-text">
                    {youtubeWorkspaceStatus.oauthStartUrl || "-"}
                  </p>
                </div>
                <div className="stack-item">
                  <strong>Connected At</strong>
                  <p className="panel-text">{youtubeWorkspaceStatus.connectedAt || "-"}</p>
                </div>
                <div className="stack-item">
                  <strong>Last Event</strong>
                  <p className="panel-text">{youtubeWorkspaceStatus.lastEvent}</p>
                </div>
              </div>
              <div className="stack-list">
                {youtubeWorkspaceStatus.guidance.map((line) => (
                  <div className="stack-item" key={line}>
                    <p className="panel-text">{line}</p>
                  </div>
                ))}
              </div>
              <div className="action-row">
                <button
                  className={`secondary-button ${isCheckingYouTube ? "is-disabled" : ""}`}
                  disabled={isCheckingYouTube}
                  onClick={() =>
                    void handleCheckYouTubeWorkspace(
                      savedSettings.apiBaseUrl,
                      savedSettings.youtubeChannelHint,
                    )
                  }
                  type="button"
                >
                  {isCheckingYouTube ? "確認中..." : "YouTube 状態を確認"}
                </button>
                {canOpenOAuthStartUrl(youtubeWorkspaceStatus) ? (
                  <button
                    className={`secondary-button ${isOpeningOAuthPage ? "is-disabled" : ""}`}
                    disabled={isOpeningOAuthPage}
                    onClick={() => void handleOpenOAuthPage(youtubeWorkspaceStatus.oauthStartUrl)}
                    type="button"
                  >
                    {isOpeningOAuthPage ? "起動中..." : "OAuth 開始ページを開く"}
                  </button>
                ) : null}
              </div>
            </article>

            <article className="panel-card accent-card wide-card">
              <p className="panel-label">通知モード</p>
              <h2>v2 で切り替える表示ルール</h2>
              <div className="stack-list">
                {overview.alertModes.map((mode) => (
                  <div className="stack-item" key={mode.title}>
                    <strong>{mode.title}</strong>
                    <p className="panel-text">{mode.behavior}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "settings" ? (
          <section className="dashboard-grid single-column">
            <article className="panel-card">
              <p className="panel-label">Desktop Settings</p>
              <h2>接続先と作業ラベル</h2>
              <div className="settings-form">
                <label className="field-group">
                  <span className="field-label">Workspace Label</span>
                  <input
                    className="field-input"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSettings((current) => ({
                        ...current,
                        workspaceLabel: value,
                      }));
                    }}
                    type="text"
                    value={settings.workspaceLabel}
                  />
                  <p className="field-help">環境名や用途が分かる表示名を入れます。</p>
                </label>

                <label className="field-group">
                  <span className="field-label">API Base URL</span>
                  <input
                    className="field-input"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSettings((current) => ({
                        ...current,
                        apiBaseUrl: value,
                      }));
                    }}
                    placeholder="http://localhost:8080"
                    type="url"
                    value={settings.apiBaseUrl}
                  />
                  <p className="field-help">
                    今後接続する Go backend のベース URL です。
                  </p>
                </label>

                <label className="field-group">
                  <span className="field-label">Overlay Base URL</span>
                  <input
                    className="field-input"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSettings((current) => ({
                        ...current,
                        overlayBaseUrl: value,
                      }));
                    }}
                    placeholder="https://overlay.example.com/subnotify"
                    type="url"
                    value={settings.overlayBaseUrl}
                  />
                  <p className="field-help">
                    OBS で読む公開 overlay 側のベース URL を想定しています。
                  </p>
                </label>

                <label className="field-group">
                  <span className="field-label">YouTube Channel Hint</span>
                  <input
                    className="field-input"
                    onChange={(event) => {
                      const value = event.currentTarget.value;
                      setSettings((current) => ({
                        ...current,
                        youtubeChannelHint: value,
                      }));
                    }}
                    placeholder="@your-channel"
                    type="text"
                    value={settings.youtubeChannelHint}
                  />
                  <p className="field-help">
                    チャンネル ID やハンドルを仮置きするメモ欄です。YouTube 状態確認にも使います。
                  </p>
                </label>
              </div>

              <div className="action-row">
                <button
                  className={`secondary-button ${
                    !hasUnsavedChanges || isSavingSettings ? "is-disabled" : ""
                  }`}
                  disabled={!hasUnsavedChanges || isSavingSettings}
                  onClick={() => void handleSaveSettings()}
                  type="button"
                >
                  {isSavingSettings ? "保存中..." : "設定を保存"}
                </button>
                <button
                  className={`secondary-button ${isCheckingBackend ? "is-disabled" : ""}`}
                  disabled={isCheckingBackend}
                  onClick={() => void handleCheckBackendConnection(settings.apiBaseUrl)}
                  type="button"
                >
                  {isCheckingBackend ? "確認中..." : "この URL で接続確認"}
                </button>
                <button
                  className={`secondary-button ${isCheckingYouTube ? "is-disabled" : ""}`}
                  disabled={isCheckingYouTube}
                  onClick={() =>
                    void handleCheckYouTubeWorkspace(
                      settings.apiBaseUrl,
                      settings.youtubeChannelHint,
                    )
                  }
                  type="button"
                >
                  {isCheckingYouTube ? "確認中..." : "YouTube 状態を確認"}
                </button>
                {canOpenOAuthStartUrl(youtubeWorkspaceStatus) ? (
                  <button
                    className={`secondary-button ${isOpeningOAuthPage ? "is-disabled" : ""}`}
                    disabled={isOpeningOAuthPage}
                    onClick={() => void handleOpenOAuthPage(youtubeWorkspaceStatus.oauthStartUrl)}
                    type="button"
                  >
                    {isOpeningOAuthPage ? "起動中..." : "OAuth 開始ページを開く"}
                  </button>
                ) : null}
              </div>

              <p className={settingsMessage?.includes("失敗") ? "error-text" : "field-help"}>
                {isLoadingSettings
                  ? "desktop 設定を読み込んでいます..."
                  : hasUnsavedChanges
                    ? "未保存の変更があります。必要なら保存してください。"
                    : settingsMessage}
              </p>
              <p className={backendConnectionStatus.ok ? "field-help" : "error-text"}>
                {backendConnectionStatus.message}
              </p>
              <p className={youtubeWorkspaceStatus.ok ? "field-help" : "error-text"}>
                {youtubeWorkspaceStatus.message}
              </p>
            </article>

            <article className="panel-card accent-card">
              <p className="panel-label">YouTube Flow</p>
              <h2>接続フローの見取り図</h2>
              <div className="timeline-list">
                {[
                  "desktop で API Base URL と Channel Hint を確認する",
                  "backend の YouTube 状態 endpoint から OAuth 開始 URL を取得して開く",
                  "ブラウザ側で認可完了を進めたら desktop で状態を再確認する",
                ].map((line, index) => (
                  <div className="timeline-item" key={line}>
                    <span className="timeline-index">{index + 1}</span>
                    <p className="panel-text">{line}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "architecture" ? (
          <section className="dashboard-grid single-column">
            <article className="panel-card accent-card">
              <p className="panel-label">Architecture</p>
              <h2>v2 の構成イメージ</h2>
              <div className="stack-list">
                {overview.architecture.map((line) => (
                  <div className="stack-item" key={line}>
                    <p className="panel-text">{line}</p>
                  </div>
                ))}
              </div>
            </article>

            <article className="panel-card">
              <p className="panel-label">Notes</p>
              <h2>前提メモ</h2>
              <div className="stack-list">
                {overview.notes.map((line) => (
                  <div className="stack-item" key={line}>
                    <p className="panel-text">{line}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {activeTab === "roadmap" ? (
          <section className="dashboard-grid single-column">
            <article className="panel-card">
              <p className="panel-label">Roadmap</p>
              <h2>次に積む作業</h2>
              <div className="timeline-list">
                {overview.nextMilestones.map((line, index) => (
                  <div className="timeline-item" key={line}>
                    <span className="timeline-index">{index + 1}</span>
                    <p className="panel-text">{line}</p>
                  </div>
                ))}
              </div>
            </article>
          </section>
        ) : null}

        {lastError ? <p className="error-text sticky-error">{lastError}</p> : null}
      </div>
    </main>
  );
}

export default App;
