# AGENTS.md

## Scope

Instructions for the entire repository.

More specific instructions may exist in nested `AGENTS.md` files. When instructions conflict, the nearer file takes precedence.

## Overview

This repository is a Mac Notes app clone with AI-powered features built on a serverless stack.
- `frontend/`: Next.js App Router
- `backend/`: FastAPI on AWS Lambda Docker
- `terraform/`: AWS infrastructure

## Shared Rules

- The root `Makefile` is the canonical entry point for project commands.
- Use the tool versions defined in `mise.toml`.
- Implement i18n for all user-facing text.
- Add or update tests for every new feature and bug fix.
- Add reusable workflow shortcuts to the root `Makefile`.
- Run cross-stack workflows, deployment, and Terraform operations from the repository root.
- Use root `make` targets for project workflows. Do not run direct `aws`, `terraform apply`, `docker build`, or `docker push` deployment commands.

## Common Commands

```bash
make dev          # prints local dev startup options
make dev-stack    # one command: backend + frontend with auth bypass against dev DSQL
                  # (requires the AWS dev profile and `make tf-init ENV=dev`)
make test
make check        # same checks as CI (ci.yml), no AWS needed
make install-hooks
make deploy ENV=prd
make tf-plan ENV=dev
```

## クラウドのエージェントで作業するとき

Claude Code on the web と Codex Cloud には AWS の認証情報を渡していない。これは意図した状態だ。

- **やらないこと:** `aws` CLI や boto3 で実環境に触る。`terraform plan` / `apply`、`make tf-*`（`tf-fmt` を除く）、
  `make deploy*` / `push-backend` / `update-lambda` などのデプロイ系、`make dev-stack*` / `test-integration*` /
  `logs*` のように `tf-switch` や AWS プロファイルを使うターゲットを実行する。
  `make install-hooks` も実行しない（lefthook の pre-push が dev の AWS に対して結合テストを流す）。
  main へ直接 push しない。
- **準備:** `bash scripts/agent/setup.sh` が CI と同じ依存を入れる（uv で Python 3.12.3 と `backend` の依存、
  bun 1.4.0 と `frontend` の依存、terraform 1.15.5、conftest、terraform のプロバイダ）。
  バージョンは `mise.toml` と `.python-version` から読む。mise があれば mise で入れ、無ければ配布元から直接落とす。
  どちらの場合も実行ファイルを `.tools/bin`（git 管理外）に置き、Makefile がそこを `PATH` の先頭に足す。何度実行してもよい。
  - Claude Code on the web: `.claude/settings.json` の SessionStart フックが `CLAUDE_CODE_REMOTE=true` のときだけ自動で実行する。
  - Codex Cloud: 環境のセットアップスクリプトに `bash scripts/agent/setup.sh` を書く。タスク中はネットワークが無いことがあるので、
    ダウンロードはすべてセットアップ段階で済ませる（terraform のプロバイダも setup.sh が先に取得し、
    `make check` はオフラインならそれを使う）。
- **完了条件:** `make check` が終了コード 0 で終わり、PR の説明に実行したコマンドと結果を書いていること。
  `make check` は `.github/workflows/ci.yml` の backend → frontend → terraform の各ジョブと同じ確認を同じ順で実行する
  （AWS は使わない）。依存が無ければ最初に setup.sh を促して止まる。`AWS_PROFILE` / `AWS_DEFAULT_PROFILE` は外して実行する。
  E2E（`e2e.yml`）は dev 環境とシークレットを使うので、クラウドでは実行せず PR の CI に任せる。
  ローカルで Playwright を使うときは、配布元からブラウザを落とせないので `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` に
  入っている Chromium を渡す。
- **人に戻すこと:** dev・prd での動作確認、デプロイ、Terraform の plan/apply、IAM やデータ資源の変更判断、
  依存の追加。PR の説明に「未確認」として明記する。
- **パイプで終了コードを隠さない:** 長いコマンドを `| tail` に流すと失敗が成功に見える。結果はファイルに書くか `set -o pipefail` を使う。

### 各クラウドの実測

`scripts/agent/probe-env.sh` を各クラウドで実行して埋める。

| 項目 | Claude Code on the web | Codex Cloud |
| --- | --- | --- |
| Python / Node / bun | 3.13.18 が既定（3.12.3 も同梱）/ 22.23.4 / bun は setup.sh が 1.4.0 を入れる。backend の .venv は setup.sh が 3.12.3 に固定する | 未計測 |
| `uv python install 3.12.3` の可否 | 可 | 未計測 |
| terraform / conftest の取得元に届くか | 届く（releases.hashicorp.com、GitHub releases のアセット）。github.com のページ自体は 400/403 を返すが、アセットの取得は通る | 未計測 |
| Docker | CLI のみ。デーモンなし | 未計測 |
| `gh` | 2.89.0。`GH_TOKEN` はあるが GraphQL は 403。REST の `gh api` を使う | 未計測 |
| キャッシュの書き込み（`$HOME`） | 可 | 未計測 |
| 外部通信 | プロキシ経由。パッケージレジストリ・hashicorp・fonts.googleapis.com に届く | 未計測 |
| Chromium（`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`） | `/usr/bin/google-chrome`（Chrome for Testing 153）。`PLAYWRIGHT_BROWSERS_PATH=/opt/pw-browsers` も注入されている | 未計測 |
| 注入される AWS 系の環境変数 | `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` / `AWS_CA_BUNDLE` と `~/.aws/config`。プレースホルダーとみられる。**使わない** | 未計測 |
| AGENTS.md を読むか（CLAUDE.md なしで） | 読む | 未計測 |
| `make check` の終了コード | 0（2026-11-15、#184） | 未計測 |

## Agent skills

### Issue tracker

Issues live in GitHub Issues on `kter/notes`, operated via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five canonical roles, unchanged (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: decisions live in `docs/adr/`. A root `CONTEXT.md` glossary does not exist yet; it is created when terms get resolved. See `docs/agents/domain.md`.
