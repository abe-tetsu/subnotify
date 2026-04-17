// API 通信層（Cookie ベース認証）

import type { ConsoleSettings } from "./storage";
import { workspaceSlug } from "./storage";

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
}

// credentials: 'include' で Cookie を送信
const defaultInit: RequestInit = { credentials: "include" };

export type Me = {
  googleUserId: string;
  email: string;
  name: string;
};

export async function getMe(apiBaseUrl: string): Promise<Me | null> {
  const base = trimSlash(apiBaseUrl);
  if (!base) return null;
  try {
    const res = await fetch(`${base}/v1/user/me`, defaultInit);
    if (res.status === 401) return null;
    if (!res.ok) return null;
    return (await res.json()) as Me;
  } catch {
    return null;
  }
}

export async function logout(apiBaseUrl: string): Promise<void> {
  const base = trimSlash(apiBaseUrl);
  if (!base) return;
  try {
    await fetch(`${base}/v1/user/logout`, { ...defaultInit, method: "POST" });
  } catch { /* ignore */ }
}

export async function loadUserSettings(apiBaseUrl: string): Promise<ConsoleSettings | null> {
  const base = trimSlash(apiBaseUrl);
  if (!base) return null;
  try {
    const res = await fetch(`${base}/v1/user/settings`, defaultInit);
    if (!res.ok) return null;
    const body = await res.json() as { settings: ConsoleSettings | null };
    return body.settings;
  } catch {
    return null;
  }
}

export async function saveUserSettings(apiBaseUrl: string, settings: ConsoleSettings): Promise<boolean> {
  const base = trimSlash(apiBaseUrl);
  if (!base) return false;
  try {
    const res = await fetch(`${base}/v1/user/settings`, {
      ...defaultInit,
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(settings),
    });
    return res.ok;
  } catch {
    return false;
  }
}

export type BackendHealth = {
  ok: boolean;
  service: string | null;
  environment: string | null;
  message: string;
};

export async function checkBackendHealth(apiBaseUrl: string): Promise<BackendHealth> {
  const base = trimSlash(apiBaseUrl);
  if (!base) return { ok: false, service: null, environment: null, message: "API Base URL が未設定です。" };

  try {
    const healthRes = await fetch(`${base}/health`, defaultInit);
    if (!healthRes.ok) {
      return { ok: false, service: null, environment: null, message: `HTTP ${healthRes.status}` };
    }
    const healthBody = (await healthRes.json()) as { ok: boolean; service: string };
    return { ok: healthBody.ok, service: healthBody.service, environment: null, message: "API に接続できました。" };
  } catch (error) {
    return { ok: false, service: null, environment: null, message: `接続エラー: ${String(error)}` };
  }
}

export type YouTubeWorkspaceStatus = {
  connected: boolean;
  stage: string;
  channelLabel: string;
  oauthStartUrl: string | null;
  connectedAt: string | null;
  lastEvent: string;
  message: string;
};

export async function fetchYouTubeStatus(apiBaseUrl: string): Promise<YouTubeWorkspaceStatus> {
  const base = trimSlash(apiBaseUrl);
  if (!base) {
    return {
      connected: false, stage: "not_connected", channelLabel: "未接続",
      oauthStartUrl: null, connectedAt: null, lastEvent: "", message: "API Base URL が未設定です。",
    };
  }

  try {
    const res = await fetch(`${base}/v1/youtube/connection`, defaultInit);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json() as {
      connected: boolean;
      stage: string;
      channelLabel: string;
      oauthStartUrl: string;
      connectedAt: string;
      lastEvent: string;
    };
    return {
      connected: body.connected,
      stage: body.stage,
      channelLabel: body.channelLabel || "未接続",
      oauthStartUrl: body.oauthStartUrl || null,
      connectedAt: body.connectedAt || null,
      lastEvent: body.lastEvent || "",
      message: body.connected
        ? "YouTube 接続中"
        : body.stage === "auth_started"
          ? "ログイン待機中"
          : "未接続",
    };
  } catch (error) {
    return {
      connected: false, stage: "not_connected", channelLabel: "接続確認失敗",
      oauthStartUrl: null, connectedAt: null, lastEvent: "",
      message: `YouTube 状態取得に失敗: ${String(error)}`,
    };
  }
}

export type WorkerStatus = { running: boolean; message: string };

export async function getWorkerStatus(settings: ConsoleSettings): Promise<WorkerStatus> {
  const base = trimSlash(settings.apiBaseUrl);
  if (!base) return { running: false, message: "停止中" };

  try {
    const res = await fetch(`${base}/v1/polling/${workspaceSlug(settings)}/status`, defaultInit);
    if (!res.ok) return { running: false, message: "停止中" };
    return await res.json() as WorkerStatus;
  } catch {
    return { running: false, message: "停止中" };
  }
}

export async function startWorker(settings: ConsoleSettings): Promise<WorkerStatus> {
  const base = trimSlash(settings.apiBaseUrl);
  if (!base) return { running: false, message: "API Base URL が未設定です。" };

  try {
    const res = await fetch(`${base}/v1/polling/${workspaceSlug(settings)}/start`, {
      ...defaultInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ intervalSec: settings.pollingIntervalSec }),
    });
    if (!res.ok) return { running: false, message: `起動失敗: HTTP ${res.status}` };
    return await res.json() as WorkerStatus;
  } catch (error) {
    return { running: false, message: `起動失敗: ${String(error)}` };
  }
}

export async function stopWorker(settings: ConsoleSettings): Promise<WorkerStatus> {
  const base = trimSlash(settings.apiBaseUrl);
  if (!base) return { running: false, message: "停止しました" };

  try {
    const res = await fetch(`${base}/v1/polling/${workspaceSlug(settings)}/stop`, {
      ...defaultInit,
      method: "POST",
    });
    if (!res.ok) return { running: false, message: "停止しました" };
    return await res.json() as WorkerStatus;
  } catch {
    return { running: false, message: "停止しました" };
  }
}

export async function sendTestEvent(
  settings: ConsoleSettings,
  testSubscriberName: string,
  kind: "new_subscriber" | "new_anonymous_subscriber",
): Promise<{ ok: boolean; message: string }> {
  const base = trimSlash(settings.apiBaseUrl);
  if (!base) return { ok: false, message: "API Base URL が未設定です。" };

  const isAnon = kind === "new_anonymous_subscriber";
  const name = isAnon ? "" : (testSubscriberName.trim() || "テストユーザー");
  const resolvedMessage = isAnon
    ? settings.anonymousMessageTemplate
    : settings.namedMessageTemplate.replace("{subscriber}", name);

  const body: Record<string, unknown> = {
    kind,
    message: resolvedMessage,
    accentColor: settings.accentColor,
    displayDurationSec: settings.displayDurationSec,
    avatarUrl: settings.avatarDataUrl || undefined,
    soundPreset: settings.soundPreset,
    soundVolume: settings.soundVolume,
  };
  if (!isAnon) body.subscriberName = name;

  try {
    const res = await fetch(`${base}/v1/events/${workspaceSlug(settings)}`, {
      ...defaultInit,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, message: `送信失敗: HTTP ${res.status}` };
    return { ok: true, message: "テスト通知を送信しました。" };
  } catch (error) {
    return { ok: false, message: `送信失敗: ${String(error)}` };
  }
}

export function getOAuthStartUrl(apiBaseUrl: string): string {
  return `${trimSlash(apiBaseUrl)}/v1/youtube/auth/start`;
}
