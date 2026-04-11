# subnotify

v2 project workspace for the successor to `subscreen`.

## Planned structure

- `apps/desktop`: Tauri + React desktop app
- `apps/overlay`: public overlay frontend for OBS
- `server`: Go backend API and workers
- `shared`: shared API schemas and types
- `docs`: notes and architecture docs

## Secret handling

- Do not commit real API keys, OAuth client secrets, access tokens, refresh tokens, or `.env` files.
- Keep local-only values in ignored files such as `.env.local`.
- If we need examples, use redacted templates like `.env.example`.
