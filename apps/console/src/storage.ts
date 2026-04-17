// localStorage + IndexedDB ベースの永続化層

export type ConsoleSettings = {
  workspaceLabel: string;
  apiBaseUrl: string;
  overlayBaseUrl: string;
  youtubeClientId: string;
  youtubeClientSecret: string;
  namedMessageTemplate: string;
  anonymousMessageTemplate: string;
  accentColor: string;
  displayDurationSec: number;
  pollingIntervalSec: number;
  soundPreset: string;
  soundVolume: number;
};

const SETTINGS_KEY = "subnotify:settings";
const DB_NAME = "subnotify";
const DB_VERSION = 1;
const AVATAR_STORE = "avatars";
const AVATAR_KEY = "main";

function generateWorkspaceId(): string {
  return crypto.randomUUID();
}

function defaultSettings(): ConsoleSettings {
  return {
    workspaceLabel: generateWorkspaceId(),
    apiBaseUrl: "https://api.abetetsu.net",
    overlayBaseUrl: "https://overlay.abetetsu.net",
    youtubeClientId: "",
    youtubeClientSecret: "",
    namedMessageTemplate: "{subscriber}さん、チャンネル登録ありがとう！",
    anonymousMessageTemplate: "チャンネル登録ありがとう！",
    accentColor: "#ef5b31",
    displayDurationSec: 6,
    pollingIntervalSec: 30,
    soundPreset: "chime",
    soundVolume: 0.8,
  };
}

export function loadSettings(): ConsoleSettings {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      const fresh = defaultSettings();
      saveSettings(fresh);
      return fresh;
    }
    const parsed = JSON.parse(raw) as Partial<ConsoleSettings>;
    const merged = { ...defaultSettings(), ...parsed };
    // 既存の古い workspaceLabel を保持
    if (parsed.workspaceLabel) merged.workspaceLabel = parsed.workspaceLabel;
    return merged;
  } catch {
    return defaultSettings();
  }
}

export function saveSettings(settings: ConsoleSettings): void {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(AVATAR_STORE)) {
        db.createObjectStore(AVATAR_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAvatarDataUrl(dataUrl: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readwrite");
    tx.objectStore(AVATAR_STORE).put(dataUrl, AVATAR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadAvatarDataUrl(): Promise<string | null> {
  try {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(AVATAR_STORE, "readonly");
      const req = tx.objectStore(AVATAR_STORE).get(AVATAR_KEY);
      req.onsuccess = () => resolve((req.result as string | undefined) ?? null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  }
}

export async function removeAvatar(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(AVATAR_STORE, "readwrite");
    tx.objectStore(AVATAR_STORE).delete(AVATAR_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function workspaceSlug(settings: ConsoleSettings): string {
  const w = settings.workspaceLabel.trim().replace(/\s+/g, "-").toLowerCase();
  return w || "default-workspace";
}
