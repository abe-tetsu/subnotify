SHELL := /bin/zsh

ROOT_DIR := /Users/abetetsuya/app/subnotify
DESKTOP_DIR := $(ROOT_DIR)/apps/desktop
OVERLAY_DIR := $(ROOT_DIR)/apps/overlay
SERVER_DIR := $(ROOT_DIR)/server
API_URL := http://localhost:8080/health

.DEFAULT_GOAL := desktop

.PHONY: desktop desktop-install overlay overlay-install api worker dev stop build-desktop build-overlay test-server help

desktop: desktop-install
	cd $(DESKTOP_DIR) && exec npm run tauri dev

desktop-install:
	cd $(DESKTOP_DIR) && npm install

overlay: overlay-install
	cd $(OVERLAY_DIR) && exec npm run dev

overlay-install:
	cd $(OVERLAY_DIR) && npm install

api:
	cd $(SERVER_DIR) && go run ./cmd/api

worker:
	cd $(SERVER_DIR) && go run ./cmd/worker

dev: desktop-install overlay-install
	@api_pid=""; \
	overlay_pid=""; \
	started_api="false"; \
	trap 'if [ -n "$$overlay_pid" ]; then kill "$$overlay_pid" 2>/dev/null || true; fi; if [ "$$started_api" = "true" ] && [ -n "$$api_pid" ]; then kill "$$api_pid" 2>/dev/null || true; fi' EXIT INT TERM; \
	if curl -fsS $(API_URL) >/dev/null 2>&1; then \
		printf "Using existing API server on http://localhost:8080\n"; \
	else \
		printf "Starting local API server on http://localhost:8080\n"; \
		(cd $(SERVER_DIR) && exec go run ./cmd/api) & \
		api_pid=$$!; \
		started_api="true"; \
		for _ in {1..20}; do \
			if curl -fsS $(API_URL) >/dev/null 2>&1; then \
				break; \
			fi; \
			sleep 1; \
		done; \
		if ! curl -fsS $(API_URL) >/dev/null 2>&1; then \
			printf "API server did not become ready at http://localhost:8080\n" >&2; \
			exit 1; \
		fi; \
	fi; \
	printf "Starting overlay on http://localhost:5173\n"; \
	(cd $(OVERLAY_DIR) && exec npm run dev) & \
	overlay_pid=$$!; \
	sleep 2; \
	printf "Starting desktop app\n"; \
	cd $(DESKTOP_DIR) && exec npm run tauri dev

stop:
	-@pkill -f 'go run ./cmd/api' >/dev/null 2>&1 || true
	-@pkill -f 'exe/api' >/dev/null 2>&1 || true
	-@pkill -f 'npm run tauri dev' >/dev/null 2>&1 || true
	-@pkill -f 'subnotify/apps/desktop.*vite' >/dev/null 2>&1 || true
	-@pkill -f 'subnotify/apps/desktop' >/dev/null 2>&1 || true
	-@pkill -f 'subnotify/apps/overlay.*vite' >/dev/null 2>&1 || true
	-@pkill -f 'tauri-appsubnotify' >/dev/null 2>&1 || true
	-@printf "Stopped local subnotify dev processes if any were running.\n"

build-desktop: desktop-install
	cd $(DESKTOP_DIR) && npm run build

build-overlay: overlay-install
	cd $(OVERLAY_DIR) && npm run build

test-server:
	cd $(SERVER_DIR) && go test ./...

help:
	@printf "Available targets:\n"
	@printf "  make           Start the desktop app via Tauri\n"
	@printf "  make desktop   Start the desktop app via Tauri\n"
	@printf "  make overlay   Start the public overlay preview app\n"
	@printf "  make api       Start the Go API server\n"
	@printf "  make worker    Start the Go worker scaffold\n"
	@printf "  make dev       Start API + overlay + desktop app together\n"
	@printf "  make stop      Stop lingering local subnotify dev processes\n"
	@printf "  make build-desktop  Build the desktop frontend\n"
	@printf "  make build-overlay  Build the overlay frontend\n"
	@printf "  make test-server    Run Go tests under server\n"
