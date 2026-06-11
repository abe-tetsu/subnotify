export type ConsoleSettings = {
  workspaceLabel: string;
  apiBaseUrl: string;
  overlayBaseUrl: string;
  namedMessageTemplate: string;
  anonymousMessageTemplate: string;
  accentColor: string;
  displayDurationSec: number;
  pollingIntervalSec: number;
  soundPreset: string;
  soundVolume: number;
  avatarDataUrl: string;
};

export function defaultSettings(apiBaseUrl: string): ConsoleSettings {
  return {
    workspaceLabel: crypto.randomUUID(),
    apiBaseUrl,
    overlayBaseUrl: "https://overlay.abetetsu.net",
    namedMessageTemplate: "{subscriber}さん、チャンネル登録ありがとう！",
    anonymousMessageTemplate: "チャンネル登録ありがとう！",
    accentColor: "#ef5b31",
    displayDurationSec: 6,
    pollingIntervalSec: 30,
    soundPreset: "chime",
    soundVolume: 0.8,
    avatarDataUrl: "",
  };
}

export function workspaceSlug(settings: ConsoleSettings): string {
  const w = settings.workspaceLabel.trim().replace(/\s+/g, "-").toLowerCase();
  return w || "default-workspace";
}

export const DEFAULT_API_BASE_URL =
  import.meta.env.MODE === "production" ? "https://api.abetetsu.net" : "http://localhost:8080";
