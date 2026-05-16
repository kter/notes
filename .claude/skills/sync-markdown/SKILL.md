---
name: sync-markdown
description: ユーザーがローカルの .md ファイルを Notes Web アプリ（notes.dev.devtools.site / notes.devtools.site）にアップロード・同期・作成・更新したいと明示した場合にこのスキルを使う。「~/docs/memo.md をアップロードして」「この .md ファイルをWebアプリに反映して」「/path/to/file.md をフォルダ XX に同期して」など、ローカルファイルのパスと操作意図（アップロード・同期・作成・更新）が両方ある場合に限る。ファイルパスが含まれていても「読む」「レビューする」「要約する」などの操作にはこのスキルを使わない。フォルダ名やノートタイトルが不明なときはユーザーに確認してから進める。
---

# sync-markdown — ローカル Markdown → Notes Web App

ローカルの `.md` ファイルを読み込み、Notes API 経由でノートを作成または更新するスキル。

---

## セキュリティ原則

- **API キーを会話・完了報告・ログに表示してはならない**。確認後は `notes_***` と伏せ字で扱う
- API キーは環境変数 `$NOTES_API_KEY` 経由でのみ渡す。値をAIへ直接貼り付けさせてはならない

---

## 前提情報

| 項目 | 値 |
|---|---|
| Dev API | `https://api.notes.dev.devtools.site` |
| Prd API | `https://api.notes.devtools.site` |
| 認証ヘッダー | `X-API-Key: $NOTES_API_KEY` |
| トークン形式 | `notes_` で始まる文字列 |

API キーは Web アプリの **Settings → API Keys → Create API Key** で発行できる。

---

## Step 1: 必要情報を集める

以下をすべて確定してから次へ進む。不足しているものはユーザーに聞く。

1. **ファイルパス** — ローカルの `.md` ファイルのパス
2. **フォルダ名** — ノートを入れるフォルダ。指定がなければ聞く
3. **ノートタイトル** — 省略時はファイル名から拡張子を除いたものをデフォルトとして提案し、ユーザーに確認する
4. **環境** — `dev`（デフォルト）か `prd`。指定がなければ `dev` を使う
5. **API キー** — 環境変数を確認する:

```bash
[ -n "$NOTES_API_KEY" ] && echo "NOTES_API_KEY: 設定済み" || echo "NOTES_API_KEY: 未設定"
```

未設定なら、AIへの貼り付けは不要。ユーザーに次を案内して終了し、設定後に再実行してもらう:
```
Settings → API Keys → Create API Key でキーを発行後、
ターミナルで以下を実行してから再度依頼してください:
  export NOTES_API_KEY=<your-key>
```

---

## Step 2: ファイルを読む

```bash
cat <ファイルパス>
```

ファイルが存在しない場合はエラーを伝えて終了。

コンテンツを JSON 文字列に変換する（改行・引用符・バックスラッシュをエスケープするため必ず `jq` を使う）:

```bash
CONTENT_JSON=$(jq -Rs '.' < <ファイルパス>)
```

---

## Step 3: フォルダを解決する

```bash
curl -s -X GET "$API_URL/api/folders" -H "X-API-Key: $NOTES_API_KEY"
```

レスポンスは `[{ "id": "...", "name": "..." }, ...]` のリスト。

**照合ルール（大文字小文字を区別しない、前後空白を無視した完全一致）:**

- **完全一致するフォルダが1件見つかった** → その `id` を使う
- **部分一致しか見つからない** → 候補リストをユーザーに提示し、選択させる
- **1件も見つからない** → 「フォルダ '〇〇' が存在しません。作成しますか？」と確認し、OK なら:

```bash
curl -s -X POST "$API_URL/api/folders" \
  -H "X-API-Key: $NOTES_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"name\": \"<フォルダ名>\"}"
```

作成された `id` を使う。

---

## Step 4: ノートが既存かどうかを確認する

```bash
curl -s -X GET "$API_URL/api/notes?folder_id=<FOLDER_ID>" -H "X-API-Key: $NOTES_API_KEY"
```

レスポンスは `[{ "id": "...", "title": "...", "content": "...", "deleted_at": null|"..." }, ...]`。

**照合ルール:**
- `deleted_at` が非 null のノートは削除済みとして照合対象から除外する
- **同じタイトルのノートが1件見つかった** → 更新（Step 5b）
- **同じタイトルのノートが複数見つかった** → リストをユーザーに提示し、更新対象を選ばせる
- **見つからない場合** → 新規作成（Step 5a）

---

## Step 5a: ノートを新規作成

```bash
curl -s -X POST "$API_URL/api/notes" \
  -H "X-API-Key: $NOTES_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"title\": \"<タイトル>\", \"content\": $CONTENT_JSON, \"folder_id\": \"<FOLDER_ID>\"}"
```

成功（201）なら完了報告へ進む。

---

## Step 5b: 既存ノートを更新

**実行前に必ずユーザーに確認する:**
「ノート '〇〇' を上書き更新します。よいですか？」

OK なら:

```bash
curl -s -X PATCH "$API_URL/api/notes/<NOTE_ID>" \
  -H "X-API-Key: $NOTES_API_KEY" \
  -H "Content-Type: application/json" \
  -d "{\"content\": $CONTENT_JSON}"
```

成功（200）なら完了報告へ進む。

---

## エラー処理

| ステータス | 対応 |
|---|---|
| 401 | API キーが無効または失効。再発行を案内する |
| 404 | フォルダまたはノートが見つからない。IDを確認して再試行 |
| 422 | リクエスト形式の問題。パラメータを見直す |
| 5xx | サーバーエラー。少し待ってリトライを提案する |

---

## 完了報告の形式

```
✓ 同期完了
  ファイル : ~/docs/memo.md
  フォルダ : 〇〇
  ノート   : 〇〇
  操作     : 新規作成 / 更新
  環境     : dev / prd
```

API キーの値は報告に含めない。
