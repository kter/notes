---
name: playwright-cli
description: >
  Automates browser interactions for web testing, form filling, screenshots, and data extraction
  using the Playwright CLI tool (token-efficient CLI mode, ~1.3% context increase vs MCP).
  Use this skill whenever the user wants to: explore a web page interactively, verify UI flows
  before writing tests, generate @playwright/test test code from observed browser behavior,
  automate form filling or data extraction, or take screenshots/snapshots of web pages.
  Also trigger when the user says "playwright", "browser automation", "E2E", "UI testing",
  or describes navigating to a URL and clicking elements.
allowed-tools:
  - Bash
---

# playwright-cli

Playwright CLI を使ったブラウザ自動化スキルです。MCPより低コスト（コンテキスト増加約1.3%）で、ブラウザ操作の確認から `@playwright/test` テストコード生成まで3段階で進めます。

## ワークフロー概要

```
Step 1: ブラウザ操作を対話的に確認（snapshot / click / screenshot）
Step 2: 確認結果をもとに @playwright/test でテストコード実装
Step 3: テスト実行と動画・トレースで検証
```

---

## Step 1: ブラウザ操作の確認

まず対象URLを開き、`snapshot` で要素の ref を取得してから操作する。

```bash
# ページを開く
playwright-cli open https://example.com/

# アクセシビリティツリーをYAML形式で取得（要素のrefを確認）
playwright-cli snapshot

# 要素をクリック（refはsnapshotから取得）
playwright-cli click e3

# テキストを入力
playwright-cli fill e5 "search text"
playwright-cli type "additional text"

# スクリーンショット（任意）
playwright-cli screenshot
playwright-cli screenshot e3   # 特定要素のみ
```

### セッション管理（複数タブ・並行操作）

```bash
playwright-cli --session=login open https://example.com/login
playwright-cli --session=login snapshot
playwright-cli session-stop-all
```

### DevTools / デバッグ

```bash
playwright-cli tracing-start          # トレース記録開始
playwright-cli tracing-stop           # トレース記録停止（.zip保存）
playwright-cli console                # コンソールログ表示
playwright-cli console error          # エラーのみ表示
playwright-cli close                  # ページを閉じる
```

> **snapshotの見方**: 出力されるYAMLの各要素に `ref: e1` のような識別子がある。これをclick/fillに渡す。スクリーンショットと `.playwright-cli/` 以下のファイルは `.gitignore` に追加しておくこと。

---

## Step 2: @playwright/test でテストコード実装

Step 1 で確認した操作フローをもとにテストを書く。

### テストコードの指針

- 要素選択は `getByRole()` / `getByText()` / `getByLabel()` を優先（snapshot のrole情報を活用）
- やむを得ない場合のみ `locator('[data-testid=...]')` を使用
- 遷移確認は `toHaveURL()` / `toHaveTitle()` で検証
- 各ステップを明示的に `await` し、フローを追いやすくする

### playwright.config.ts の推奨設定

```typescript
import { defineConfig } from '@playwright/test';

export default defineConfig({
  use: {
    baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:3000',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',   // 失敗時に動画を保存
  },
});
```

### テスト実装例

```typescript
import { test, expect } from '@playwright/test';

test('カテゴリ選択からサブカテゴリへの遷移', async ({ page }) => {
  // Step1で確認したフローをそのままコード化
  await page.goto('/');
  await page.getByRole('button', { name: 'カテゴリ' }).click();
  await page.getByRole('option', { name: 'ニュース' }).click();
  await expect(page).toHaveURL(/\/news/);
  await expect(page.getByRole('heading')).toHaveText('ニュース');
});
```

---

## Step 3: テスト実行と検証

```bash
# ヘッドありで実行（動作を目視確認）
npx playwright test --headed

# 特定のテストのみ
npx playwright test e2e/my-test.spec.ts --headed

# トレースビューアで確認
npx playwright show-trace trace.zip

# 動画・スクリーンショットの確認
ls playwright-report/
```

---

## よくある使い方パターン

### 新しい画面のフローを探索してテスト化する

1. `playwright-cli open <url>` でページを開く
2. `playwright-cli snapshot` で要素一覧を確認
3. 操作（click / fill）してフローを追う
4. 各ステップで `snapshot` や `screenshot` を取り、UIの状態を確認
5. 確認したフローを `@playwright/test` でテストとして記述
6. `npx playwright test --headed` で実行・検証

### フォーム操作の自動化

```bash
playwright-cli open https://example.com/form
playwright-cli snapshot
playwright-cli fill e2 "田中太郎"     # 名前フィールド
playwright-cli fill e3 "taro@example.com"  # メールフィールド
playwright-cli click e10              # 送信ボタン
playwright-cli snapshot               # 送信後の状態確認
playwright-cli screenshot             # 結果のスクリーンショット
```

---

## .gitignore への追加

```
.playwright-cli/
playwright-report/
test-results/
```
