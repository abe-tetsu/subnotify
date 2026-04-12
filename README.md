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
  - architecture notes
  - roadmap
- Frontend build and Rust check are passing.

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
- confirmed `npm run build` and `cargo check` pass for `apps/desktop`

- In progress:
  - defining the v2 desktop control panel shape
  - refining the separation between desktop, overlay, and Go backend responsibilities
  - preparing the desktop app to connect to the Go backend health endpoint

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
  - add YouTube connection UI
  - add backend connectivity check and server health display
  - add overlay preview URL helpers
  - add a clearer onboarding flow for first-time setup

- Backend
  - decide storage strategy for channel state and notification history
  - add channel and auth endpoints
  - add structured logging and request logging
  - add real worker jobs for subscriber polling

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
cd /Users/abetetsuya/app/subnotify/server
go run ./cmd/api
```

## Run the backend worker

```bash
cd /Users/abetetsuya/app/subnotify/server
go run ./cmd/worker
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

## Secret handling

- Do not commit real API keys, OAuth client secrets, access tokens, refresh tokens, or `.env` files.
- Keep local-only values in ignored files such as `.env.local`.
- If we need examples, use redacted templates like `.env.example`.

## Notes

- This repository is intended to be pushed to Git, so real secrets must never be committed.
- For local development, use ignored files such as `.env.local`.
- If we need sample configuration, add redacted template files only.
