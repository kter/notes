/**
 * ノートをローカルから完全に忘れるための単一エントリポイント。
 *
 * 主なエクスポート:
 * - forgetNoteLocally: IndexedDB からの削除と noteBodyStore からの本文破棄を対で実行する
 *
 * 背景:
 * ノート本文の所有者は noteBodyStore ただ一つである。IndexedDB からノートを消しながら
 * ストアに本文を残すと、モジュールスコープの Map に到達不能な本文が溜まり続ける。
 * ローカル削除を行う経路が複数あるため、その対を 1 箇所に閉じ込めてすべての呼び出し元で
 * 共有する。
 *
 * 呼び出し関係: useNoteSyncEngine / workspaceSync / syncQueue のローカル削除経路から使用される。
 */

import { notesDB } from "@/lib/indexedDB";
import { noteBodyStore } from "./noteBodyStore";

/**
 * 指定 noteId をローカル (IndexedDB + 本文ストア) から削除する。
 * サーバーへの削除リクエストは行わない。呼び出し元の責務である。
 */
export async function forgetNoteLocally(id: string): Promise<void> {
  await notesDB.deleteNote(id);
  noteBodyStore.delete(id);
}
