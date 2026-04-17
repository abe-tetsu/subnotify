// API 通信層

import type { ConsoleSettings } from "./storage";
import { workspaceSlug } from "./storage";

function trimSlash(url: string): string {
  return url.trim().replace(/\/+$/, "");
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
    const healthRes = await fetch(`${base}/health`);
    if (!healthRes.ok) {
      return { ok: false, service: null, environment: null, message: `HTTP ${healthRes.status}` };
    }
    const healthBody = (await healthRes.json()) as { ok: boolean; service: string };

    let environment: string | null = null;
    try {
      const metaRes = await fetch(`${base}/v1/meta`);
      if (metaRes.ok) {
        const metaBody = (await metaRes.json()) as { environment: string };
        environment = metaBody.environment;
      }
    } catch { /* ignore */ }

    return {
      ok: healthBody.ok,
      service: healthBody.service,
      environment,
      message: "API に接続できました。",
    };
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
    const res = await fetch(`${base}/v1/youtube/connection`);
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

export async function sendCredentials(settings: ConsoleSettings): Promise<void> {
  const base = trimSlash(settings.apiBaseUrl);
  if (!base || !settings.youtubeClientId.trim() || !settings.youtubeClientSecret.trim()) return;

  await fetch(`${base}/v1/youtube/credentials`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      clientId: settings.youtubeClientId.trim(),
      clientSecret: settings.youtubeClientSecret.trim(),
    }),
  });
}

export type WorkerStatus = { running: boolean; message: string };

export async function getWorkerStatus(settings: ConsoleSettings): Promise<WorkerStatus> {
  const base = trimSlash(settings.apiBaseUrl);
  if (!base) return { running: false, message: "停止中" };

  try {
    const res = await fetch(`${base}/v1/polling/${workspaceSlug(settings)}/status`);
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
    const res = await fetch(`${base}/v1/polling/${workspaceSlug(settings)}/stop`, { method: "POST" });
    if (!res.ok) return { running: false, message: "停止しました" };
    return await res.json() as WorkerStatus;
  } catch {
    return { running: false, message: "停止しました" };
  }
}

export async function sendTestEvent(
  settings: ConsoleSettings,
  testSubscriberName: string,
  avatarDataUrl: string | null,
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
    avatarUrl: avatarDataUrl ?? undefined,
    soundPreset: settings.soundPreset,
    soundVolume: settings.soundVolume,
  };
  if (!isAnon) body.subscriberName = name;

  try {
    const res = await fetch(`${base}/v1/events/${workspaceSlug(settings)}`, {
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
