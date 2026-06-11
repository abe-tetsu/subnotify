# subnotify

YouTube のチャンネル登録通知を OBS オーバーレイとして配信画面に表示するシステムです。

## アーキテクチャ

| コンポーネント | 技術 | 役割 |
|---|---|---|
| `server` | Go | API・登録者ポーリング・通知配信 |
| `apps/console` | React + Vite | 管理画面（Google ログイン・設定・テスト送信） |
| `apps/overlay` | React + Vite | OBS 用オーバーレイ（公開URL・透明背景） |

セッションとユーザー設定は Firestore に保存します。

## フロー

1. console で Google ログイン（YouTube OAuth）
2. 「ポーリング開始」で API サーバーが登録者を監視（既定 30 秒間隔）
3. 新規登録を検出すると通知イベントを配信
4. OBS のブラウザソース（overlay）が通知カードを表示

公開登録者は名前付き、非公開登録者は匿名通知として表示します。

## ディレクトリ構成

```
subnotify/
├── apps/
│   ├── console/        # 管理画面（React + Vite）
│   └── overlay/        # OBS オーバーレイ（React + Vite）
├── server/             # Go バックエンド
│   ├── cmd/api/        # HTTP API サーバー
│   └── internal/
│       ├── app/        # 状態管理
│       ├── auth/       # セッション（Firestore）
│       ├── config/     # 設定読み込み
│       ├── httpapi/    # ルーター・ハンドラ
│       ├── notify/     # 通知（broker / poller / store）
│       ├── store/      # ユーザー設定（Firestore）
│       └── youtube/    # YouTube OAuth・API
├── shared/             # 共有型・OpenAPI（未着手）
└── Makefile
```

## 開発

```bash
make dev          # API(8080) + overlay(5173) + console(1420) を同時起動
make api          # API のみ
make console      # console のみ
make overlay      # overlay のみ
make stop         # ローカルプロセス停止
make test-server  # Go テスト
make help
```

YouTube OAuth クレデンシャルを `server/.env.local` に設定します（`server/.env.example` 参照）。

## デプロイ（Cloud Run）

GCP プロジェクト `subscreen` / リージョン `asia-northeast1`。

`main` への push で、変更のあったサービスを GitHub Actions が自動デプロイします（`.github/workflows/deploy.yml`）。手動実行は Actions の workflow_dispatch から。認証は Workload Identity 連携を使用し、以下の GitHub Secrets が必要です。

| Secret | 用途 |
|---|---|
| `GCP_WIF_PROVIDER` | Workload Identity プロバイダのリソース名 |
| `GCP_SERVICE_ACCOUNT` | デプロイ用サービスアカウントのメール |
| `SUBNOTIFY_YOUTUBE_CLIENT_ID` | YouTube OAuth クライアントID |
| `SUBNOTIFY_YOUTUBE_CLIENT_SECRET` | YouTube OAuth クライアントシークレット |

ローカルからの手動デプロイ:

```bash
make deploy           # API + overlay + console
make deploy-api
make deploy-overlay
make deploy-console
make deploy-local     # ローカルで build して preview
```

| サービス | URL |
|---|---|
| console | https://console.abetetsu.net |
| overlay | https://overlay.abetetsu.net |
| API | https://api.abetetsu.net |

## OBS 設定

ブラウザソースに以下の形式の URL を設定します（console のダッシュボードで生成）。

```
https://overlay.abetetsu.net/live/{workspace}?api=https://api.abetetsu.net
```

`{workspace}` は Google アカウントごとに自動生成されます。

## シークレット管理

- クレデンシャル・トークンはコミットしない
- ローカル値は `.env.local`（gitignore 済み）
- サンプルは `.env.example`
