# subnotify

v2 project workspace for the successor to `subscreen`.

## Current status

- Project skeleton has been created.
- The first visible desktop shell is implemented in `apps/desktop`.
- A first Go backend scaffold is implemented in `server`.
- `apps/desktop` uses `Tauri + React` and follows the visual direction of `subscreen`.
- The desktop app currently shows:
  - dashboard
  - settings
  - backend connectivity check
  - YouTube connection workspace status
  - architecture notes
  - roadmap
- Frontend build, Rust check, and Go tests are passing.

## Progress

- Done:
  - created the base directory structure for `apps`, `server`, `shared`, and `docs`
  - added a project-level `.gitignore` to avoid committing secrets and local artifacts
  - created the first Tauri desktop app shell in `apps/desktop`
  - added a minimal Rust command to return desktop overview data
  - added initial v2 UI based on the `subscreen` style
  - added desktop settings UI for API URL, overlay URL, workspace label, and channel hint
  - added Tauri-side local persistence for desktop settings
  - initialized the Go module under `server`
  - added a minimal API server with `/health` and `/v1/meta`
  - added a worker scaffold with heartbeat logging
  - added a root `Makefile` so the desktop app can be started from the project root
  - added a `make stop` target and improved local shutdown behavior for `make dev`
  - adjusted `make stop` so it quietly handles lingering local dev processes
  - added desktop-to-backend connectivity checks using `/health` and `/v1/meta`
  - improved `make dev` so it can start the local API if needed and then launch the desktop app from a single terminal
  - added a backend YouTube connection status scaffold endpoint at `/v1/youtube/connection`
  - added a desktop YouTube workspace card and status check flow
  - added a scaffold OAuth start page at `/v1/youtube/auth/start`
  - added desktop links to open the scaffold OAuth start page from the saved backend state
  - added an in-memory scaffold auth callback at `/v1/youtube/auth/callback`
  - added temporary backend state transitions so YouTube status can move from `not_connected` to `auth_started` to `connected`
  - added Go tests that verify the scaffold YouTube connection flow
  - switched the desktop OAuth launch action to Tauri opener so external browser pages can actually be opened from the app
  - added desktop auto-refresh so scaffold auth completion is picked up automatically while waiting for OAuth
  - hardened desktop auto-refresh so it keeps checking even if the initial `auth_started` response is missed right after opening the browser
  - added overlay preview URL helpers to the desktop app for OBS/live and named or anonymous preview URLs
  - expanded `make stop` so it also cleans up the compiled local Go API process left by `go run`
  - confirmed `npm run build`, `cargo check`, and `go test ./...` pass

- In progress:
  - defining the v2 desktop control panel shape
  - refining the separation between desktop, overlay, and Go backend responsibilities
  - preparing the desktop app to connect to the real YouTube OAuth backend flow
  - shaping how the scaffold auth flow will be replaced by real token persistence

- Not started yet:
  - public overlay frontend
  - YouTube OAuth and subscriber polling
  - anonymous subscriber notification logic

## Planned structure

- `apps/desktop`: Tauri + React desktop app
- `apps/overlay`: public overlay frontend for OBS
- `server`: Go backend API and workers
- `shared`: shared API schemas and types
- `docs`: notes and architecture docs

## TODO

- Desktop
  - add a clearer onboarding flow for first-time setup
  - surface backend auth/channel connection state in the desktop app

- Backend
  - decide storage strategy for channel state and notification history
  - add channel and auth endpoints
  - add structured logging and request logging
  - add real worker jobs for subscriber polling
  - persist YouTube connection state instead of keeping it only in memory
  - replace the scaffold auth start/callback pages with the real Google OAuth flow

- YouTube integration
  - implement OAuth flow on the backend side
  - fetch subscriber count periodically
  - fetch visible subscribers where available
  - compare count increase vs visible subscriber events

- Notification logic
  - show named notifications when a visible subscriber is available
  - show anonymous notifications when subscriber count increases but no visible subscriber can be identified
  - define de-duplication and retry behavior

- Overlay
  - create `apps/overlay`
  - design OBS-ready public overlay UI
  - define how overlay receives live events from the backend

- Shared
  - define API contracts
  - add shared event/type definitions

## Run the desktop app

```bash
cd /Users/abetetsuya/app/subnotify
make
```

## Run the backend API

```bash
cd /Users/abetetsuya/app/subnotify
make api
```

## Run the backend worker

```bash
cd /Users/abetetsuya/app/subnotify
make worker
```

## Useful make targets

```bash
cd /Users/abetetsuya/app/subnotify
make help
make
make api
make worker
make dev
make stop
```

`make dev` is the recommended local start command when you want both the API and the desktop app. It will reuse an existing API on `http://localhost:8080` if one is already running, otherwise it starts the API first and then opens the desktop app from the same terminal.

## Verify backend connectivity from the desktop app

1. Start both the backend and the desktop app from one terminal:

```bash
cd /Users/abetetsuya/app/subnotify
make dev
```

2. Wait until the desktop window opens.
3. Open the `設定` tab and confirm `API Base URL` is `http://localhost:8080`.
4. Click `この URL で接続確認`.
5. Confirm the message shows backend connection success.
6. Open the `ダッシュボード` tab and confirm the backend health card shows the service and environment.

## Verify YouTube workspace status from the desktop app

1. Start the local API and the desktop app together:

```bash
cd /Users/abetetsuya/app/subnotify
make dev
```

2. Open the `設定` tab.
3. Confirm `API Base URL` is `http://localhost:8080`.
4. Optionally set `YouTube Channel Hint` to something like `@your-channel`.
5. Click `YouTube 状態を確認`.
6. Confirm the message says the YouTube connection is not completed yet but the flow data was fetched.
7. Open the `ダッシュボード` tab and confirm the `YouTube Workspace` card shows:
   - `Stage` as `not_connected`
   - `OAuth Start URL` as `http://localhost:8080/v1/youtube/auth/start?channel_hint=...` when a hint is set
   - the channel hint you entered, if any
8. Click `OAuth 開始ページを開く` and confirm a browser tab opens the scaffold auth page.

## Verify the scaffold auth callback flow

1. Start both the backend and the desktop app:

```bash
cd /Users/abetetsuya/app/subnotify
make dev
```

2. In the desktop app, open `設定` and set `YouTube Channel Hint` if needed.
3. Click `YouTube 状態を確認`, then `OAuth 開始ページを開く`.
4. In the opened browser page, click `認可完了をシミュレートする`.
5. Confirm the browser shows the connected scaffold page.
6. Return to the desktop app and wait a few seconds, or focus the window again.
7. Confirm the `YouTube Workspace` card changes to:
   - `接続済み`
   - `Stage` as `connected`
   - `Connected At` with a timestamp

## Verify overlay preview URL helpers

1. Start the desktop app:

```bash
cd /Users/abetetsuya/app/subnotify
make dev
```

2. Open `設定`.
3. Set `Overlay Base URL` to something like `https://overlay.example.com/subnotify`.
4. Set `Workspace Label` and optionally `YouTube Channel Hint`.
5. Confirm the `Overlay Helper` card shows:
   - `OBS Live URL`
   - `名前あり Preview`
   - `名前なし Preview`
6. Save the settings and open `ダッシュボード`.
7. Confirm the same helper URLs appear in `overlay URL helper`.

## Secret handling

- Do not commit real API keys, OAuth client secrets, access tokens, refresh tokens, or `.env` files.
- Keep local-only values in ignored files such as `.env.local`.
- If we need examples, use redacted templates like `.env.example`.

## Notes

- This repository is intended to be pushed to Git, so real secrets must never be committed.
- For local development, use ignored files such as `.env.local`.
- If we need sample configuration, add redacted template files only.
