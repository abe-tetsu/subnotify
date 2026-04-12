# subnotify

YouTube チャンネル登録通知を OBS オーバーレイとして表示するシステムです。`subscreen` の v2 として、デスクトップアプリ・バックエンドAPI・オーバーレイの3コンポーネント構成で開発しています。

## アーキテクチャ

| コンポーネント | 技術 | 役割 |
|---|---|---|
| `apps/desktop` | Tauri + React | デスクトップ管理パネル（設定・接続管理） |
| `apps/overlay` | React + Vite | OBS 用オーバーレイ（公開URL） |
| `server` | Go | バックエンドAPI + ワーカー（認証・ポーリング・通知配信） |

## 現在の状態

### 完了

- **デスクトップアプリ**
  - Tauri + React のアプリシェル（ダッシュボード、設定、アーキテクチャ、ロードマップタブ）
  - 設定の永続化（API URL、オーバーレイURL、ワークスペース、チャンネルヒント）
  - バックエンド接続確認（`/health`, `/v1/meta`）
  - YouTube 接続状態の表示と自動リフレッシュ
  - オーバーレイプレビューURL ヘルパー
  - OAuth 開始ページのブラウザ起動

- **バックエンドAPI**
  - Go API スケルトン（`/health`, `/v1/meta`, `/v1/youtube/connection`）
  - 実際の YouTube OAuth（Google 認可 → トークン交換 → チャンネル情報取得）
  - トークンの JSON ファイル永続化（`.subnotify-data/youtube_token.json`）
  - トークン自動リフレッシュ（期限切れ時に再永続化）
  - CSRF state 検証
  - サーバー再起動時のトークン自動復元
  - ワーカーでのトークン有効性確認
  - デスクトップUIからのクレデンシャル入力・バックエンド自動反映
  - Go テスト（モック OAuthProvider によるフロー検証）
  - 登録者ポーリング（`subscriptions.list?mySubscribers=true`、30秒間隔、設定可能）
  - 差分検出（初回は記録のみ、2回目以降で新規登録者を検出）
  - 既知登録者IDのファイル永続化（`.subnotify-data/seen_subscribers.json`）
  - 通知イベントのファイル書き出し（`.subnotify-data/pending_events.json`）

- **オーバーレイ**
  - React + Vite シェル
  - 3モード表示（live / named preview / anonymous preview）
  - URL ベースのモード切り替え

- **通知配信**
  - インメモリ Broker によるイベント配信（Pub/Sub パターン）
  - オーバーレイからの HTTP ポーリング（2秒間隔）で通知受信
  - 通知カードのスライドイン/アウトアニメーション + カウントダウンバー
  - キュー管理（複数通知を順番に表示）
  - 重複防止（イベントID ベース）
  - テスト通知送信（デスクトップアプリのテストタブから）

- **本番環境**
  - Cloud Run にデプロイ済み（GCP プロジェクト: `subscreen`、リージョン: `asia-northeast1`）
  - オーバーレイ: `https://overlay.abetetsu.net`
  - API: `https://api.abetetsu.net`
  - カスタムドメイン（Cloudflare DNS → Cloud Run）
  - OBS 用 URL: `https://overlay.abetetsu.net/live/{workspace}?api=https://api.abetetsu.net`

- **開発環境**
  - `make dev` で API + オーバーレイ + デスクトップを同時起動
  - ビルド・テスト全パス（`npm run build`, `cargo check`, `go test`）

### 次にやること

- 通知カードのカスタマイズ（アクセントカラー、アバター画像）
- 効果音の実装（subscreen から移植）
- GitHub Actions で自動デプロイ

### 未着手

- データベース永続化（チャンネル状態、通知履歴）
- 匿名通知ロジック（登録者数増加 vs 公開登録者の差分）
- 構造化ログ・リクエストログ
- 共有型定義（OpenAPI、TypeScript/Go 型）

## ディレクトリ構成

```
subnotify/
├── apps/
│   ├── desktop/          # Tauri + React デスクトップアプリ
│   │   ├── src/          # React ソース
│   │   └── src-tauri/    # Rust バックエンド
│   └── overlay/          # OBS 用オーバーレイ
│       └── src/          # React ソース
├── server/               # Go バックエンド
│   ├── cmd/
│   │   ├── api/          # HTTP API サーバー
│   │   └── worker/       # バックグラウンドワーカー
│   └── internal/
│       ├── app/          # コアロジック・状態管理
│       ├── config/       # 設定読み込み
│       ├── httpapi/      # HTTPルーター・ハンドラ
│       ├── auth/         # 認証（未実装）
│       ├── youtube/      # YouTube 連携（未実装）
│       ├── notify/       # 通知ロジック（未実装）
│       ├── store/        # データ永続化（未実装）
│       └── overlay/      # オーバーレイ連携（未実装）
├── shared/               # 共有型定義・OpenAPI スキーマ
├── docs/                 # ドキュメント
└── Makefile              # ビルド・実行コマンド
```

## 開発

### 起動コマンド

```bash
# API + デスクトップアプリを同時起動（推奨）
make dev

# API のみ起動
make api

# ワーカーのみ起動
make worker

# オーバーレイのみ起動（ポート 5173）
make overlay

# プロセス停止
make stop

# ヘルプ
make help
```

`make dev` は `http://localhost:8080` で API が起動していなければ自動で起動し、その後デスクトップアプリを開きます。

### ビルド

```bash
# デスクトップアプリ
make build-desktop

# オーバーレイ
make build-overlay

# Go テスト
make test-server
```

## 動作確認

### バックエンド接続確認

1. `make dev` で起動
2. 設定タブで API Base URL が `http://localhost:8080` であることを確認
3. 「この URL で接続確認」をクリック
4. 接続成功のメッセージを確認

### YouTube 接続フロー（スカフォールド）

1. `make dev` で起動
2. 設定タブで YouTube Channel Hint を入力（任意）
3. 「YouTube 状態を確認」をクリック
4. 「OAuth 開始ページを開く」でブラウザが開く
5. 「認可完了をシミュレートする」をクリック
6. デスクトップアプリに戻ると自動で「接続済み」に変わる

### オーバーレイ確認

1. `make overlay` で起動
2. ブラウザで以下を確認:
   - `http://localhost:5173/live/default-workspace` — ライブモード
   - `http://localhost:5173/preview/default-workspace?mode=named&channel=demo-channel` — 名前あり
   - `http://localhost:5173/preview/default-workspace?mode=anonymous` — 名前なし

## シークレット管理

- API キー、OAuth シークレット、トークンをコミットしない
- ローカル専用の値は `.env.local` に記載（gitignore 済み）
- サンプル設定が必要な場合は `.env.example` を使用
