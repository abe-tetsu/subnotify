# subnotify

v2 project workspace for the successor to `subscreen`.

## Current status

- Project skeleton has been created.
- The first visible desktop shell is implemented in `apps/desktop`.
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
  - confirmed `npm run build` and `cargo check` pass for `apps/desktop`

- In progress:
  - defining the v2 desktop control panel shape
  - refining the separation between desktop, overlay, and Go backend responsibilities
  - preparing the desktop app to connect to the future Go backend

- Not started yet:
  - Go backend implementation
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
  - initialize Go module under `server`
  - add API server entrypoint
  - add worker entrypoint for polling jobs
  - define config loading from environment variables
  - decide storage strategy for channel state and notification history

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
cd /Users/abetetsuya/app/subnotify/apps/desktop
npm install
npm run tauri dev
```

## Secret handling

- Do not commit real API keys, OAuth client secrets, access tokens, refresh tokens, or `.env` files.
- Keep local-only values in ignored files such as `.env.local`.
- If we need examples, use redacted templates like `.env.example`.

## Notes

- This repository is intended to be pushed to Git, so real secrets must never be committed.
- For local development, use ignored files such as `.env.local`.
- If we need sample configuration, add redacted template files only.
