SHELL := /bin/zsh

ROOT_DIR := /Users/abetetsuya/app/subnotify
DESKTOP_DIR := $(ROOT_DIR)/apps/desktop
SERVER_DIR := $(ROOT_DIR)/server

.DEFAULT_GOAL := desktop

.PHONY: desktop desktop-install api worker dev stop build-desktop test-server help

desktop: desktop-install
	cd $(DESKTOP_DIR) && exec npm run tauri dev

desktop-install:
	cd $(DESKTOP_DIR) && npm install

api:
	cd $(SERVER_DIR) && go run ./cmd/api

worker:
	cd $(SERVER_DIR) && go run ./cmd/worker

dev: desktop-install
	@api_pid=""; \
	trap 'if [ -n "$$api_pid" ]; then kill "$$api_pid" 2>/dev/null || true; fi' EXIT INT TERM; \
	(cd $(SERVER_DIR) && exec go run ./cmd/api) & \
	api_pid=$$!; \
	cd $(DESKTOP_DIR) && exec npm run tauri dev

stop:
	-@pkill -f 'go run ./cmd/api' >/dev/null 2>&1 || true
	-@pkill -f 'npm run tauri dev' >/dev/null 2>&1 || true
	-@pkill -f 'subnotify/apps/desktop.*vite' >/dev/null 2>&1 || true
	-@pkill -f 'subnotify/apps/desktop' >/dev/null 2>&1 || true
	-@pkill -f 'tauri-appsubnotify' >/dev/null 2>&1 || true
	-@printf "Stopped local subnotify dev processes if any were running.\n"

build-desktop: desktop-install
	cd $(DESKTOP_DIR) && npm run build

test-server:
	cd $(SERVER_DIR) && go test ./...

help:
	@printf "Available targets:\n"
	@printf "  make           Start the desktop app via Tauri\n"
	@printf "  make desktop   Start the desktop app via Tauri\n"
	@printf "  make api       Start the Go API server\n"
	@printf "  make worker    Start the Go worker scaffold\n"
	@printf "  make dev       Start the Go API server and desktop app together\n"
	@printf "  make stop      Stop lingering local subnotify dev processes\n"
	@printf "  make build-desktop  Build the desktop frontend\n"
	@printf "  make test-server    Run Go tests under server\n"
