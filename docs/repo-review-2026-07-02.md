# リポジトリ総合レビュー & 改善指示書（2026-07-02）

対象: `kter/notes`（Mac Notes クローン / Next.js + FastAPI on Lambda + Aurora DSQL + Terraform）
レビュー方法: 静的調査（コード・設定・git 履歴・CI 定義・Terraform 構成）。デプロイ環境への接続は行っていない。

---

## 1. エグゼクティブサマリー

全体として **成熟度は高い**。機能境界で分割されたバックエンド（`features/` モジュラーモノリス）、ADR による設計判断の記録、構造化ログ・Sentry・requestID 伝搬、conftest による Terraform ポリシー検査、203 件のバックエンドテスト + E2E スイート、lefthook による pre-commit / pre-push ガードなど、個人プロジェクトの水準を大きく超えている。

一方で、以下の 4 点が**優先度の高いギャップ**として残っている。

| # | 指摘 | 影響 | 優先度 |
|---|------|------|--------|
| 1 | **GitHub Actions に unit テスト / lint の CI がない**（E2E のみ。品質ゲートがローカルの lefthook 頼み） | フックをスキップした push / 他環境からの PR で壊れたコードが main に入り得る | **P1** |
| 2 | **Bedrock モデルがリタイア済み世代**（`anthropic.claude-3-5-sonnet-20240620-v1:0`、2025-10-28 リタイア） | AI 要約・チャットが 404 で停止する（既に停止している可能性） | **P1** |
| 3 | **`python-jose` が未メンテかつ既知 CVE あり**（CVE-2024-33663 / 33664） | JWT 検証という最重要経路に既知脆弱性のあるライブラリ | **P1** |
| 4 | **`uv.lock` が .gitignore されており依存が固定されていない** | ビルドごとに依存が変動し得る。再現性・サプライチェーンの穴 | **P1** |

P2 以下として、テスト DB の方言乖離（SQLite vs DSQL/Postgres）、E2E の paths フィルタ、リポジトリ衛生（実体のない `MCP_IMPLEMENTATION_SUMMARY.md`、古い README、未追跡ファイル群）、フロントエンドの巨大コンポーネント、JWT 検証の堅牢化などがある。詳細は §3、実装手順は §4 の指示書を参照。

---

## 2. 良い点（維持すべきもの）

- **バックエンド構造**: `features/{workspace,assistant,images,settings,share,admin}` の機能境界分割、`use_cases` / `repositories` / `router` の層分離。`docs/REARCHITECTURE_BLUEPRINT.md` の設計方針と実装が一致している。
- **ADR**: DSQL の永続化境界・ランタイムブートストラップという「コードから読み取れない判断」が `docs/adr/` に残っている。
- **可観測性**: 構造化ログ（`log_event` + イベント名規約 `ops.*` / `security.*`）、X-Request-ID 伝搬、sentry-trace / traceparent 対応、`/health` のログレベル抑制。
- **セキュリティの積み上げ**: 過去コミットで ReDoS 対策、CORS 絞り込み、マジックバイト検証、401 無限リトライ停止などを継続的に潰している。バイパストークンも「環境変数未設定なら無効」の設計。
- **Terraform**: cloudtrail / backup / conftest ポリシー + fixture テストまで整備。`default_tags`、workspace ベースの環境分離。
- **開発体験**: `make dev-stack` の一発起動、`mise.toml` のバージョン固定、lefthook、`.env.example`。

---

## 3. 指摘事項（観点別）

### 3.1 CI/CD

- **[CI-1] unit / lint CI の欠如（P1）**: `.github/workflows/` には `e2e.yml` のみ。`make test`（backend pytest + frontend vitest + lint）を実行するワークフローが存在しない。lefthook はローカル任せであり、`--no-verify` や別マシンからの push で素通りする。
- **[CI-2] E2E の paths フィルタに backend が含まれない（P2）**: `e2e.yml` のトリガーは `frontend/**`, `Makefile`, `README.md` のみ。バックエンド変更が E2E を起動しない（E2E はデプロイ済み dev 環境相手なのでタイミング問題はあるが、少なくとも `backend/**` 変更で dev デプロイ後に E2E を回す導線がない）。また `README.md` でトリガーされるのは無駄。
- **[CI-3] 依存更新の自動化なし（P3）**: Dependabot / Renovate の設定がない。

### 3.2 セキュリティ

- **[SEC-1] `python-jose` の継続利用（P1）**: `backend/pyproject.toml` が `python-jose[cryptography]>=3.3.0` に依存。python-jose は事実上未メンテで、CVE-2024-33663（アルゴリズム混同）/ CVE-2024-33664（JWE 解凍爆弾）が知られている。現用途（Cognito RS256 検証）は直撃ではないが、認証の中核を未メンテライブラリに置く理由がない。**PyJWT への移行を推奨**。
- **[SEC-2] JWT クレーム検証の不足（P2）**: `backend/app/auth/cognito.py:122` の `jwt.decode` は署名・iss・aud を検証するが、`token_use` クレームを確認していない。Cognito の access token と ID token の取り違えを防ぐため、期待する `token_use`（現状の運用なら `"id"` または `"access"` のどちらか実際に使っている方）を明示検証すべき。
  - 補足: access token には `aud` クレームがなく `client_id` になる。現状 `audience=` 検証が通っているなら ID token 運用のはず。検証を入れる際に実トークンで確認すること。
- **[SEC-3] JWKS キーローテーション時の再取得なし（P2）**: `_get_signing_key` が kid 不一致で `None` → 即 401。TTL(1h) 内に Cognito がキーをローテーションすると、最大 1 時間全ユーザーが 401 になる。kid ミス時に JWKS を強制再取得して 1 回だけリトライすべき。
- **[SEC-4] バイパストークン比較が非定数時間（P3）**: `cognito.py:86` などの `token == settings.integration_test_bypass_token` は `secrets.compare_digest` にする。dev 限定なので低優先。
- **[SEC-5] DSQL へ常時 admin 接続（P3）**: `database.py:71` が `generate_db_connect_admin_auth_token` + `user="admin"`。アプリ用 DB ロールを作り `generate_db_connect_auth_token`（非 admin）に落とすのが最小権限。DSQL のロール機能制約を確認の上、ADR に判断を残すこと。

### 3.3 依存関係・再現性

- **[DEP-1] ロックファイル未コミット（P1）**: `.gitignore` が `uv.lock` を除外している。バックエンドは `>=` 制約のみで、ビルド（Lambda Docker イメージ含む）ごとに依存バージョンが変動し得る。`uv.lock` をコミットし、Docker ビルドで `uv sync --frozen` を使うべき。frontend は `package-lock.json` がコミット済みで問題なし。
- **[DEP-2] Bedrock モデルがリタイア済み（P1）**: `terraform/lambda.tf:23` が `anthropic.claude-3-5-sonnet-20240620-v1:0`（2025-10-28 リタイア）、`backend/app/config.py:49` のデフォルトも旧世代。現行世代（Bedrock 上は `anthropic.` プレフィックス付きの `anthropic.claude-opus-4-8` / コスト重視なら `anthropic.claude-sonnet-5`）へ移行が必要。**現行の boto3 `invoke_model`（legacy パス）ではなく、Anthropic 公式 SDK の Bedrock Mantle クライアントへの移行を推奨**（新世代 ID は Mantle エンドポイント経由）。
- **[DEP-3] `@types/node` が `^20` なのに node は 24.14 固定（P3）**: `frontend/package.json`。`^24` に合わせる。

### 3.4 テスト

- **[TEST-1] テスト DB が SQLite、本番は DSQL/Postgres（P2）**: `backend/tests/conftest.py` は in-memory SQLite。JSON 型・トランザクション分離・`ON CONFLICT`・型強制などの方言差がテストをすり抜ける。全面移行は不要だが、(a) リポジトリ層のテストだけでも Postgres（devcontainer の Postgres か testcontainers）で回す `make test-backend-pg` を追加し、(b) pre-push か CI で実行するのが現実的。
- **[TEST-2] 良い点**: テストマップ（unit / contracts / external-api / sync / ai-regression / refactor-regressions）が Makefile に整理されており、回帰スイートの設計は良い。

### 3.5 リポジトリ衛生・ドキュメント

- **[DOC-1] `MCP_IMPLEMENTATION_SUMMARY.md` が実体のないコードを記述（P2）**: `lambda/mcp_server/main.py`、`terraform/mcp.tf`、`docs/mcp_setup/` 等を「実装済み」と説明しているが、**いずれもリポジトリに存在しない**（`lambda/` 配下は `.venv` と `uv.lock` の残骸のみ、git 追跡ファイルはゼロ）。エージェントや新規参加者を確実に誤誘導する。削除するか、`docs/archive/` に「未実装・過去の計画」と明記して移す。
- **[DOC-2] README のプロジェクト構造が古い（P2）**: `backend/app/{routers,services,repositories}` と記載されているが、実際は `features/` ベース。リアーキ後に未更新。
- **[DOC-3] 未追跡ファイルの整理（P3）**: `notes/`（個人メモ: day1.md 等）と `docs/security-review-2026-05-18.html` が未追跡のまま。個人メモは `.gitignore` に追加、セキュリティレビューはコミットするか削除するか判断する。`.claude/skills/sync-markdown/SKILL.md` の削除も未コミットのまま放置されている。ルートの `terraform.tfstate`（181 バイトの残骸、ignored）も削除してよい。
- **[DOC-4] ルート直下のドキュメント散乱（P3）**: `MCP_IMPLEMENTATION_SUMMARY.md` の件と合わせ、設計文書は `docs/` に集約する。

### 3.6 フロントエンド

- **[FE-1] 巨大コンポーネント（P2）**: `EditorPanel.tsx`（878 行）、`SettingsDialog.tsx`（735 行）、`AdminConsole.tsx`（596 行）、`AIChatPanel.tsx`（532 行）。テスト容易性と変更影響範囲の観点で、タブ/セクション単位の子コンポーネント + カスタムフックへ分割する。
- **[FE-2] API クライアントにタイムアウトがない（P3）**: `frontend/src/lib/api.ts` の `fetch` に `AbortSignal.timeout()` がなく、ハングした接続がそのまま UI を待たせる。同期キューにはリトライがあるため実害は限定的だが、`AbortSignal.timeout(30_000)` 程度を既定にするとよい。

### 3.7 インフラ

- **[INFRA-1] Terraform の CI 検証なし（P2）**: conftest ポリシーはあるが、CI で `terraform validate` / `terraform fmt -check` / conftest が回っていない（lefthook のみ）。CI-1 のワークフローに含める。
- **[INFRA-2] 良い点**: cloudtrail / backup / IAM の分割、CloudFront + S3、Cognito の passkey 対応など、構成自体は堅実。

---

## 4. 実装指示書（エージェント向け）

> **共通ルール**（`AGENTS.md` 準拠）
> - コマンドはリポジトリルートの `make` ターゲット経由で実行する。`terraform apply` / `docker build` 等の直接実行は禁止。
> - 新機能・修正には必ずテストを追加/更新する。ユーザー向け文言は i18n（`frontend/src/locales/`）。
> - 1 タスク = 1 ブランチ = 1 PR。着手前に `git checkout -b <branch>` すること。
> - 各タスクの最後に `make test`（および該当する検証コマンド）を実行し、結果を PR 本文に記載する。

---

### TASK CI-1: ユニットテスト & lint の GitHub Actions ワークフロー追加 【P1】

**ブランチ**: `ci/add-unit-lint-workflow`

**目的**: PR / main push で backend・frontend のユニットテストと lint、Terraform 静的検査を必ず実行する。

**変更ファイル**:
- 新規: `.github/workflows/ci.yml`

**手順**:
1. `Makefile` の `test-backend` / `test-frontend` / `test-lint` / `format-check` / `conftest-verify` の実体（実行コマンドと前提）を確認する。
2. `.github/workflows/ci.yml` を作成する。要件:
   - トリガー: `pull_request`（main 向け）と `push`（main）。paths フィルタは付けない（全変更で実行）。
   - `concurrency` で同一 ref の古い実行をキャンセル。
   - **job: backend** — `astral-sh/setup-uv` で uv を導入（バージョンは `mise.toml` の `0.11.17` に合わせる）、Python 3.12.3、`cd backend && uv sync --extra dev` 後に pytest と `ruff check` / `ruff format --check` を実行。AWS 認証情報は不要であること（ユニットテストは SQLite）。必要とするテストがあれば CI では除外マーカーを検討。
   - **job: frontend** — `actions/setup-node@v4`（node 24.14.0、npm cache）、`npm ci`、`npm test -- --run`、`npm run lint`、`npx tsc --noEmit`。
   - **job: terraform** — `hashicorp/setup-terraform`（1.15.5）で `terraform -chdir=terraform init -backend=false` → `terraform -chdir=terraform validate` → `terraform fmt -check -recursive terraform/`。conftest は `open-policy-agent/conftest` のリリースバイナリ（`mise.toml` の 0.68.2）を取得して `conftest verify` 相当を実行。
3. 可能な限り `make` ターゲットを呼ぶ形にするが、CI 環境で AWS プロファイルを前提とするターゲット（`tf-switch` 依存など）は避け、直接コマンドで代替してよい（その場合は理由をワークフローのコメントに残す）。

**受け入れ基準**:
- PR 作成で 3 job が起動し、現状の main で全て green になる。
- backend job が AWS 認証情報なしで完走する。

**検証**: ローカルで `make test` が通ること。push 後、Actions の実行結果を確認し PR に記載。

---

### TASK DEP-2: Bedrock モデルの現行世代への移行 【P1】

**ブランチ**: `feature/upgrade-bedrock-model`

**目的**: リタイア済みの `anthropic.claude-3-5-sonnet-20240620-v1:0` から現行世代へ移行し、AI 要約・チャットを復旧/維持する。

**背景知識（重要）**:
- 現行実装は boto3 `bedrock-runtime` の `invoke_model`（legacy パス、`backend/app/features/assistant/gateway.py:82-130`）。この API 形式は旧世代 ID（`...-v2:0` 形式）専用。
- 現行世代モデルは **Anthropic 公式 SDK の Bedrock Mantle クライアント**経由で使う: `pip install "anthropic[bedrock]"` → `from anthropic import AnthropicBedrockMantle` → `AnthropicBedrockMantle(aws_region=...)`。モデル ID は `anthropic.` プレフィックス付きの現行 ID（**日付サフィックスなし**）。
- 推奨モデル: `anthropic.claude-opus-4-8`（既定・品質優先、$5/$25 per MTok）。コスト優先なら `anthropic.claude-sonnet-5`（$3/$15、2026-08-31 まで $2/$10）。**どちらにするかはユーザーに確認するか、環境変数で切替可能にして既定を `anthropic.claude-opus-4-8` とする。**
- 呼び出しは `client.messages.create(model=..., max_tokens=..., system=..., messages=[...])`。レスポンスは `response.content` の `block.type == "text"` を連結。トークン数は `response.usage.input_tokens` / `output_tokens`。
- `temperature` 等のサンプリングパラメータは現行 Opus/Sonnet 系では **送ると 400** になるため付けない。`thinking` は付けない（既定でよい）。

**変更ファイル**:
1. `backend/pyproject.toml` — `anthropic[bedrock]` を dependencies に追加。
2. `backend/app/features/assistant/gateway.py` — `BedrockGateway._invoke_model` を Mantle クライアントに置換。boto3 の `invoke_model` / `anthropic_version: bedrock-2023-05-31` ボディ組み立てを削除。タイムアウト・リトライは SDK のクライアント設定（`timeout`, `max_retries`）で行い、既存の `log_event` 呼び出し（`ops.ai.bedrock.*`）は同等のイベント名で維持する。
3. `backend/app/config.py:49` — `bedrock_model_id` の既定値を `anthropic.claude-opus-4-8` に変更。
4. `terraform/lambda.tf:23` — `BEDROCK_MODEL_ID = "anthropic.claude-opus-4-8"` に変更。worker Lambda 側（`terraform/async_jobs.tf`）にも同じ環境変数があれば揃える。
5. `terraform/iam.tf:42-45` — 既存の `foundation-model/anthropic.claude-*` / `inference-profile/us.anthropic.claude-*` ワイルドカードで新モデルもカバーされるか確認。Mantle エンドポイント用に追加の IAM アクション（`bedrock:InvokeModel` 以外）が要る場合は最小権限で追加。
6. テスト: `backend/tests/` の gateway 関連テスト（モック）を新クライアントの呼び出し形に更新。使用モデル ID を assert するテストがあれば新 ID に更新。

**手順**:
1. gateway のモック境界を確認（テストがどのレイヤーをモックしているか）。
2. 上記変更を実装。ストリーミングは現状非対応のままでよい（非同期ジョブ化済みのため）。
3. `make test-backend` と `make test-ai-regression` を実行。
4. `make tf-plan ENV=dev` で環境変数変更の差分を確認（apply はユーザー確認後）。
5. ローカル確認: `make dev-stack` を起動し、ノート要約を 1 回実行して成功することを確認（`notes-local-verify` スキルの手順に準拠）。

**受け入れ基準**:
- 要約・チャット・編集ジョブが新モデルで成功する。
- 旧モデル ID がリポジトリから消える（`grep -r "claude-3-5" --include='*.py' --include='*.tf'` がゼロ件）。
- トークン使用量の記録（`token_usage`）が引き続き正しく保存される。

---

### TASK SEC-1: python-jose → PyJWT 移行 【P1】

**ブランチ**: `security/migrate-to-pyjwt`

**目的**: 未メンテの python-jose を排除し、JWT 検証を PyJWT に置き換える。

**変更ファイル**:
- `backend/pyproject.toml` — `python-jose[cryptography]` を削除し `pyjwt[crypto]>=2.9` を追加。
- `backend/app/auth/cognito.py` — `jose.jwt` → `jwt`（PyJWT）。
  - `jwt.get_unverified_header(token)` は PyJWT にも同名 API がある。
  - JWKS からの鍵構築は `jwt.PyJWK(key_dict).key` を使う（`python-jose` は dict を直接受けたが PyJWT は鍵オブジェクトが必要）。
  - `jwt.decode(token, key, algorithms=["RS256"], audience=..., issuer=..., options={"require": ["exp", "iss", "sub"]})`。
  - 例外マッピング: `jose.JWTError` → `jwt.PyJWTError`、`jose.exceptions.ExpiredSignatureError` → `jwt.ExpiredSignatureError`。
- `backend/app/auth/dependencies.py` — `from jose import JWTError` を PyJWT の例外に置換。
- このタスク内で **SEC-2（`token_use` 検証）と SEC-3（kid ミス時の JWKS 再取得 1 回リトライ）、SEC-4（`secrets.compare_digest`）も併せて実装**する（同一ファイルのため）。
  - SEC-2: decode 成功後に `claims.get("token_use")` を検証。期待値は既存の実トークン運用に合わせる（テスト bypass クレームは `"access"` を返しているのでそれを基準に、フロントが送っているのが ID token なら `"id"` を許可。**不明なら両対応にせず、ログで実値を確認してから絞る**）。
  - SEC-3: `_get_signing_key` が None のとき、キャッシュを破棄して `_get_jwks()` を再実行し、もう一度だけ探す。それでも None なら 401。
- テスト: `backend/tests/` の auth 系テストを更新。追加テスト: (a) 期限切れトークンで 401、(b) kid 不一致 → JWKS 再取得で成功するケース、(c) `token_use` 不一致で 401、(d) bypass トークン一致/不一致。

**受け入れ基準**:
- `grep -r "jose" backend/app backend/pyproject.toml` がゼロ件。
- `make test-backend` green。
- `make dev-stack` でのログイン → API 呼び出しが通る（bypass トークンと実 Cognito トークン両方。実トークンは dev 環境の統合テスト `make test-integration ENV=dev` で確認）。

---

### TASK DEP-1: uv.lock のコミットと frozen ビルド 【P1】

**ブランチ**: `build/commit-uv-lock`

**手順**:
1. `.gitignore` から `uv.lock` の行を削除。
2. `cd backend && uv lock` を実行し、`backend/uv.lock` をコミット。
3. `backend/Dockerfile` を確認し、依存インストールを `uv sync --frozen --no-dev`（または同等）に変更。lock がイメージビルドで使われることを確認する。
4. `lambda/` 配下の残骸（`.venv`, `.pytest_cache`, `uv.lock`, `__pycache__`）は **DOC-1 タスクで処理するため触らない**。
5. `make test-backend` と、可能なら `make build-backend`（該当ターゲット名は Makefile で確認）でイメージビルドが通ることを確認。

**受け入れ基準**: `backend/uv.lock` が追跡され、Docker ビルドが lock を尊重する。

---

### TASK TEST-1: Postgres 実 DB でのリポジトリ層テスト追加 【P2】

**ブランチ**: `test/add-postgres-repository-tests`

**目的**: SQLite では検出できない方言差（JSON、ON CONFLICT、型強制、トランザクション挙動）を Postgres で検証する。

**手順**:
1. `.devcontainer/` の Postgres 定義（`postgresql://notes:notes@localhost:5432/notes`、`backend/.env.example` 参照）を確認。
2. `backend/tests/conftest.py` に `pg_engine` フィクスチャを追加: 環境変数 `TEST_DATABASE_URL` があればそれを使い、なければ `pytest.skip`。テーブルは `SQLModel.metadata.create_all` + テストごとにトランザクションロールバック（または truncate）で分離。
3. `@pytest.mark.postgres` マーカーを定義（`pyproject.toml` の `[tool.pytest.ini_options]` に `markers` 追加）。
4. リポジトリ層（`features/workspace/repositories/`）の既存テストのうち、SQL 方言に依存しやすいもの（upsert、JSON カラム、カーソルページネーション、`applied_mutations` の重複制御）を Postgres でも回すパラメタライズ、または専用テストファイル `tests/test_repositories_pg.py` を追加。
5. `Makefile` に `test-backend-pg` ターゲットを追加（`TEST_DATABASE_URL=postgresql://notes:notes@localhost:5432/notes uv run pytest -m postgres`）。ヘルプコメント（`## ...`）も付ける。
6. `lefthook.yml` の pre-push への追加は**ユーザーに提案するに留める**（ローカル Postgres 前提のため強制しない）。CI（TASK CI-1 のワークフロー）には `services: postgres` を追加して実行するのが望ましい。

**受け入れ基準**: `make test-backend-pg` がローカル（devcontainer Postgres 起動時）で green。Postgres なしの `make test-backend` は従来どおり skip されず全件通る。

---

### TASK DOC-1〜4: リポジトリ衛生の一括整理 【P2】

**ブランチ**: `chore/repo-hygiene`

**手順**:
1. **MCP ドキュメント**: `MCP_IMPLEMENTATION_SUMMARY.md` が記述するファイル（`lambda/*/main.py`, `terraform/mcp.tf`, `iam_mcp.tf`, `docs/mcp_setup/`）が存在しないことを再確認した上で、`docs/archive/mcp-implementation-plan.md` へ移動し、冒頭に「**注意: この文書が記述する MCP サーバーは現在のリポジトリには実装されていない**（過去の計画/削除済み）」の注記を追加。ルートからは削除。
2. **lambda/ 残骸**: `lambda/` ディレクトリを丸ごと削除（git 追跡ファイルはゼロ。`.venv` 等のローカル生成物のみ）。ユーザーが MCP サーバーを再実装する予定の場合に備え、削除は PR 説明に明記。
3. **README 更新**: `README.md` の Project Structure を実構造（`backend/app/features/`, `core/`, `bootstrap/`, `models/`）に合わせて書き直す。`docs/REARCHITECTURE_BLUEPRINT.md` のコンテキストマップと整合させる。
4. **.gitignore**: `notes/` を追加（個人メモ用ディレクトリとして）。ルートの `terraform.tfstate`（181B の残骸）をファイル削除。
5. **未追跡ファイルの処遇**: `docs/security-review-2026-05-18.html` はコミットするか削除するか**ユーザーに確認**（内容にセキュリティ指摘が含まれるため公開リポジトリなら削除推奨）。`.claude/skills/sync-markdown/SKILL.md` の削除（git status で `D`）は意図を確認の上、このブランチでコミットするか復元する。
6. `MCP_IMPLEMENTATION_SUMMARY.md` への参照が他ファイルにないか `grep -r "MCP_IMPLEMENTATION" .` で確認し、あれば更新。

**受け入れ基準**: `git status` がクリーン、README の構造記述と実ディレクトリが一致、実体のないコードを「実装済み」と述べる文書がルートに存在しない。

---

### TASK CI-2: E2E ワークフローの paths 修正 【P2】

**ブランチ**: `ci/fix-e2e-paths`

**手順**:
1. `.github/workflows/e2e.yml` の `paths` から `README.md` を削除。
2. `backend/**` を追加するかは運用に依存する: E2E はデプロイ済み dev を叩くため、「backend 変更 → dev デプロイ → E2E」の順序が保証されない。**推奨**: `paths` に `backend/**` は追加せず、代わりに `workflow_dispatch` 運用（現状あり）を deploy ワークフロー完了後に `workflow_run` トリガーで自動化する案をユーザーに提示し、承認されたら実装。承認前は README.md 削除のみで PR を出す。

---

### TASK FE-1: 巨大コンポーネントの分割（EditorPanel から着手） 【P2〜P3・分割実施】

**ブランチ**: `refactor/split-editor-panel`（1 コンポーネントずつ別 PR）

**手順**（EditorPanel の例。SettingsDialog / AdminConsole / AIChatPanel も同型で別タスク化）:
1. `frontend/src/components/layout/EditorPanel.tsx`（878 行）の責務を列挙する（表示モード切替、ツールバー連携、チェックボックストグル、自動保存、共有、エクスポート等）。
2. 状態ロジックをカスタムフック（例: `useEditorAutosave`, `useEditorSelection`）へ、UI ブロックを子コンポーネントへ抽出。**外部から見た props と挙動は変えない**（純リファクタ）。
3. 既存テスト `EditorPanel.test.tsx`（777 行）が**無変更で通る**ことを分割の完了条件とする。抽出したフックには新規ユニットテストを追加。
4. `make test-frontend` → 既存 E2E の `markdown` 系 spec をローカルで実行（`notes-local-verify` の手順で動作確認）。

**受け入れ基準**: 各ファイル 400 行以下を目安、既存テスト全 green、スナップショット的な UI 変化なし。

---

### TASK SEC-5: DSQL 接続の最小権限化（調査タスク） 【P3】

**ブランチ**: `security/dsql-least-privilege`

**手順**:
1. Aurora DSQL のカスタム DB ロール + `generate_db_connect_auth_token`（非 admin）の対応状況を AWS ドキュメントで確認。
2. 対応可能なら: Terraform でロール作成（DSQL はスキーマ内 SQL でのロール管理になるため、`bootstrap/database_bootstrap.py` での初期化に含める設計を検討）、`backend/app/database.py` のトークン生成を非 admin 版に変更、IAM ポリシー（`terraform/iam.tf` の `dsql:DbConnectAdmin`）を `dsql:DbConnect` に絞る。
3. 制約があり移行不能・過剰コストと判断した場合は、**`docs/adr/0003-dsql-admin-connection.md` として「admin 接続を継続する」判断と理由を記録**して終了してよい。

---

### TASK CI-3: Renovate 導入 【P3】

**ブランチ**: `ci/add-renovate`

**手順**: `renovate.json` をルートに追加。推奨設定: `config:recommended` ベース、`lockFileMaintenance` 有効、`packageRules` で AWS SDK / boto3 はまとめて週1、メジャーアップデートは自動 PR のみ（automerge しない）。GitHub App の有効化はユーザー操作が必要なので PR 説明に手順を記載。

---

### TASK FE-2: API クライアントにタイムアウト追加 【P3】

**ブランチ**: `fix/api-client-timeout`

**手順**: `frontend/src/lib/api.ts` の `request()` に `signal: options.signal ?? AbortSignal.timeout(30_000)` を追加。呼び出し側が signal を渡せる口は維持。`TimeoutError`（`DOMException`）を `ApiError(0, "timeout", ...)` 相当に正規化するかは既存のエラーハンドリング（syncQueue のリトライ分類）を確認して決める。テスト: vitest でタイムアウト時に reject されることを fake timer で検証。

---

## 5. 推奨着手順序

```
1. CI-1（品質ゲート確立 — 以降の全タスクの安全網）
2. DEP-1(uv.lock) → DEP-2(Bedrockモデル) ※ DEP-2 は依存追加があるため lock 後
3. SEC-1（PyJWT 移行 + SEC-2/3/4 同梱）
4. DOC-1〜4（衛生整理）/ CI-2 / TEST-1
5. FE-1（コンポーネント分割、1つずつ）/ SEC-5 / CI-3 / FE-2
```

各タスクは独立ブランチ・独立 PR。P1 の 4 件が完了した時点で、残存リスクの大半は解消される。
