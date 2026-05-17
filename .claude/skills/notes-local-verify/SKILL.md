---
name: notes-local-verify
description: >
  Verify Notes app behavior end-to-end against the local development stack using auth bypass.
  Use this skill whenever the user wants to confirm that changes work correctly in a real browser
  against a locally running backend — especially after modifying frontend or backend code.

  Trigger on phrases like: "ローカルで動作確認", "ローカルで確認して", "ローカルでE2E",
  "ローカル環境で確認", "verify changes locally", "make sure it works locally",
  "check my change in the browser", "ローカルで試して", "動作確認して", "ローカルスタックで確認".

  Do NOT trigger for: pure unit tests (`make test-backend`, `make test-frontend`), lint/format
  checks, type-check only requests, or when the user targets the deployed dev/prd environment.
allowed-tools: Bash(make:*), Bash(curl:*), Bash(lsof:*)
---

# Notes ローカル環境 E2E 検証

Auth bypass (`local-dev-token`) を使ってローカルスタックに対してスモーク + Playwright E2E を実行し、変更が表示まで含めて動作することを確認する。ユニットテストや型チェックではなく、**実際のブラウザ表示まで確認することが目的**。

## 前提条件

- `~/.aws` に `dev` プロファイルで SSO ログイン済み
- devcontainer 内、または `~/.aws/credentials` が有効な環境

---

## Step 1: スタックの起動確認

```bash
curl -fsS http://localhost:8000/health 2>/dev/null && echo "backend: ok" || echo "backend: NOT RUNNING"
curl -fsS -o /dev/null -w "frontend: %{http_code}\n" http://localhost:3000 2>/dev/null || echo "frontend: NOT RUNNING"
```

- **バックエンドが起動していない場合**: ユーザーに別ターミナルで `make dev-stack-backend ENV=dev` を実行するよう案内する。バックエンドのみでよければ `dev-stack-backend`、フロントも必要なら `make dev-stack ENV=dev`。
- **フロントエンドが起動していない場合**: `make dev-frontend` または `make dev-stack ENV=dev` を案内する。
- 起動を待ってから次のステップへ。すでに両方起動していればそのまま続行。

バックエンドが起動しているかは `/health` のレスポンスで確認。ポート競合があれば `lsof -i:8000` で確認できる。

---

## Step 2: スモークテスト

```bash
make smoke-local
```

`scripts/smoke_local.sh` が bypass トークン `local-dev-token` を使って以下を確認する:

1. `GET /health` → `{"status":"healthy"}`
2. `GET /openapi.json` → OpenAPI スキーマが取得できる
3. `GET /api/admin/me` → `admin: true`（bypass ユーザーは自動的に admin）
4. `GET /api/folders` → 一覧が取得できる
5. `GET /api/workspace/snapshot` → スナップショットが取得できる
6. `POST /api/notes` → 作成 → `DELETE /api/notes/{id}` → 削除が成功する

失敗した場合は対応するカールコマンドのエラーを確認し、DSQL 接続 / CORS / ENVIRONMENT の設定を見直す（後述のトラブルシュートを参照）。

---

## Step 3: Playwright E2E

ローカル環境では `E2E_TARGET=local` で実行する。これにより `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` が自動的に有効化され、Cognito ログインが不要になる。

**デフォルト（golden path 全体）:**
```bash
make test-e2e-local TEST_ARGS='tests/golden-path.spec.ts'
```

**テスト対象を絞りたい場合:**
```bash
# 特定のテスト名パターン
make test-e2e-local TEST_ARGS='-g "create note"'

# regression スイートのみ
make test-e2e-local-regression

# 特定の regression ファイル
make test-e2e-local TEST_ARGS='tests/regression/settings.spec.ts'
```

テストが **失敗した場合**: `frontend/playwright-report/index.html` を開いてトレースビューアーを確認する。トレース付きで再実行したい場合:

```bash
cd frontend && E2E_TARGET=local npx playwright test --project=chromium --trace=on tests/golden-path.spec.ts
```

---

## Step 4: 結果の報告

**全 pass の場合**: スモークと E2E の合格内容を簡潔にまとめる。

**失敗がある場合**:
- 失敗したテスト名とエラーメッセージを引用する
- `frontend/playwright-report/index.html` を案内する
- 可能であれば原因を特定して修正案を提示する

---

## トラブルシュート

| 症状 | 対処 |
|------|------|
| `curl: (7) Failed to connect to localhost port 8000` | バックエンド未起動。`make dev-stack-backend ENV=dev` を別ターミナルで実行 |
| DSQL 接続エラー (`Signature expired`) | `aws sso login --profile dev` で再ログイン |
| `admin: false` が返る | `ENVIRONMENT=local` または `ENVIRONMENT=dev` が設定されているか確認 |
| CORS エラー | バックエンドの `CORS_ORIGINS` に `http://localhost:3000` が含まれているか確認 |
| ポート競合 | `lsof -i:8000` でプロセスを確認して `kill <PID>` |
| 画面が真っ白 | `NEXT_PUBLIC_DEV_AUTH_BYPASS=true` がフロントエンドに渡っているか確認。`make dev-stack ENV=dev` で起動していれば自動設定される |
| Playwright タイムアウト | バックエンドの起動を待ってから再実行。`dev-stack-backend` が DSQL に接続できているか `/health` で確認 |

---

## 参考: bypass の仕組み

- **bypass トークン**: `local-dev-token`
- **bypass ユーザー**: `sub=local-dev-user-id`, `email=local-dev-user@example.com`, admin=true
- 有効条件: バックエンドの `ENVIRONMENT` が `local` または `dev`、かつフロントエンドの `NEXT_PUBLIC_DEV_AUTH_BYPASS=true`
- `make dev-stack ENV=dev` はこれらを自動で設定してバックエンド + フロントエンドを起動する
