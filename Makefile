SHELL := /bin/zsh

ROOT_DIR := /Users/abetetsuya/app/subnotify
CONSOLE_DIR := $(ROOT_DIR)/apps/console
OVERLAY_DIR := $(ROOT_DIR)/apps/overlay
SERVER_DIR := $(ROOT_DIR)/server
API_URL := http://localhost:8080/health

.DEFAULT_GOAL := dev

.PHONY: console console-install overlay overlay-install api dev stop build-console build-overlay test-server help deploy-local deploy deploy-api deploy-overlay deploy-console

console: console-install
	cd $(CONSOLE_DIR) && exec npm run dev

console-install:
	cd $(CONSOLE_DIR) && npm install

overlay: overlay-install
	cd $(OVERLAY_DIR) && exec npm run dev

overlay-install:
	cd $(OVERLAY_DIR) && npm install

api:
	cd $(SERVER_DIR) && go run ./cmd/api

dev: console-install overlay-install
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
	printf "Starting console on http://localhost:1420\n"; \
	cd $(CONSOLE_DIR) && exec npm run dev

stop:
	-@pkill -f 'go run ./cmd/api' >/dev/null 2>&1 || true
	-@pkill -f 'exe/api' >/dev/null 2>&1 || true
	-@pkill -f 'subnotify/apps/console.*vite' >/dev/null 2>&1 || true
	-@pkill -f 'subnotify/apps/overlay.*vite' >/dev/null 2>&1 || true
	-@printf "Stopped local subnotify dev processes if any were running.\n"

build-console: console-install
	cd $(CONSOLE_DIR) && npm run build

build-overlay: overlay-install
	cd $(OVERLAY_DIR) && npm run build

test-server:
	cd $(SERVER_DIR) && go test ./...

GCLOUD := /Users/abetetsuya/google-cloud-sdk/bin/gcloud
GCP_PROJECT := subscreen
GCP_REGION := asia-northeast1

# ローカルで build して静的配信で確認（Cloud Run 相当の挙動）
deploy-local: build-console build-overlay
	@printf "ローカル配信: console http://localhost:4173, overlay http://localhost:4174\n"
	@( cd $(CONSOLE_DIR) && npx vite preview --port 4173 ) & \
	( cd $(OVERLAY_DIR) && npx vite preview --port 4174 ) & \
	wait

deploy: deploy-api deploy-overlay deploy-console
	@printf "Deploy complete.\n"

deploy-api:
	@printf "Deploying API to Cloud Run...\n"
	@if [ ! -f $(SERVER_DIR)/.env.local ]; then \
		printf "Error: server/.env.local not found. Create it with SUBNOTIFY_YOUTUBE_CLIENT_ID and SUBNOTIFY_YOUTUBE_CLIENT_SECRET.\n" >&2; \
		exit 1; \
	fi
	$(eval YT_CLIENT_ID := $(shell grep SUBNOTIFY_YOUTUBE_CLIENT_ID $(SERVER_DIR)/.env.local | cut -d= -f2))
	$(eval YT_CLIENT_SECRET := $(shell grep SUBNOTIFY_YOUTUBE_CLIENT_SECRET $(SERVER_DIR)/.env.local | cut -d= -f2))
	cd $(SERVER_DIR) && $(GCLOUD) run deploy subnotify-api \
		--source=. \
		--project=$(GCP_PROJECT) \
		--region=$(GCP_REGION) \
		--port=8080 \
		--max-instances=1 \
		--min-instances=0 \
		--allow-unauthenticated \
		--memory=256Mi \
		--cpu=1 \
		--timeout=300 \
		--set-env-vars="SUBNOTIFY_YOUTUBE_CLIENT_ID=$(YT_CLIENT_ID),SUBNOTIFY_YOUTUBE_CLIENT_SECRET=$(YT_CLIENT_SECRET),SUBNOTIFY_PUBLIC_BASE_URL=https://api.abetetsu.net,SUBNOTIFY_DATA_DIR=/tmp/subnotify-data,SUBNOTIFY_CONSOLE_BASE_URL=https://console.abetetsu.net,SUBNOTIFY_FIRESTORE_PROJECT=subscreen" \
		--quiet

deploy-overlay:
	@printf "Deploying overlay to Cloud Run...\n"
	cd $(OVERLAY_DIR) && $(GCLOUD) run deploy subnotify-overlay \
		--source=. \
		--project=$(GCP_PROJECT) \
		--region=$(GCP_REGION) \
		--port=8080 \
		--max-instances=1 \
		--min-instances=0 \
		--allow-unauthenticated \
		--memory=128Mi \
		--cpu=1 \
		--timeout=10 \
		--quiet

deploy-console:
	@printf "Deploying console to Cloud Run...\n"
	cd $(CONSOLE_DIR) && $(GCLOUD) run deploy subnotify-console \
		--source=. \
		--project=$(GCP_PROJECT) \
		--region=$(GCP_REGION) \
		--port=8080 \
		--max-instances=1 \
		--min-instances=0 \
		--allow-unauthenticated \
		--memory=128Mi \
		--cpu=1 \
		--timeout=10 \
		--quiet

help:
	@printf "Available targets:\n"
	@printf "  make             Start API + overlay + console (default)\n"
	@printf "  make console     Start the admin console (dev server)\n"
	@printf "  make overlay     Start the overlay preview app\n"
	@printf "  make api         Start the Go API server\n"
	@printf "  make dev         Start API + overlay + console together\n"
	@printf "  make stop        Stop lingering local subnotify dev processes\n"
	@printf "  make deploy-local  Build and preview locally (console:4173, overlay:4174)\n"
	@printf "  make deploy        Deploy API + overlay + console to Cloud Run\n"
	@printf "  make deploy-api    Deploy API only\n"
	@printf "  make deploy-overlay Deploy overlay only\n"
	@printf "  make deploy-console Deploy console only\n"
