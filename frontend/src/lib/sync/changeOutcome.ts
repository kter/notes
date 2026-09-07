/**
 * ワークスペース変更をサーバーへ送った結果の分類。
 *
 * 主なエクスポート:
 * - ChangeFailure: 失敗の閉じた種別
 * - classifyChangeFailure: 例外を種別へ変換する
 *
 * 呼び出し関係: useNoteSyncEngine・useFolders・syncQueue から使われる。
 *
 * このモジュールが存在する理由:
 *   「409 ならスナップショットを取り直す／401 ならキューに積んでセッション失効を
 *   通知する／それ以外はキューに積んでリトライする」という同じ梯子が、3 ファイル
 *   7 箇所に少しずつ違う形で手書きされていた。とくに useFolders には 401 の分岐が
 *   無く、セッション失効中のフォルダ名変更は、エラーログを出して黙ってキューに
 *   積まれるだけでバナーが出なかった。
 *
 *   種別の判定はここが唯一の所有者。各呼び出し側は「その種別に対して何をするか」
 *   （state の更新、リトライの予約）だけを持つ。
 *
 *   判定そのものも以前は workspaceSync 側にあり、3 つのテストファイルが
 *   モックの中でそれを再実装していた。テストのために書き直さねばならない
 *   述語はシームとして機能していないので、分類を持つこのモジュールへ移した。
 */

import { ApiError } from "@/lib/api";

export type ChangeFailure =
  /** バージョン競合。最新スナップショットを取り直せば整合性が戻る。 */
  | { kind: "conflict" }
  /** セッション失効。リトライしても回復しないため、即座に中断してバナーを出す。 */
  | { kind: "sessionExpired" }
  /** 一時的な失敗。キューに積み、バックオフでリトライしてよい。 */
  | { kind: "retryable"; error: unknown };

/**
 * サーバー送信で発生した例外を、対応方法が一意に決まる種別へ変換する。
 */
export function classifyChangeFailure(error: unknown): ChangeFailure {
  if (isConflictApiError(error)) return { kind: "conflict" };
  if (isAuthApiError(error)) return { kind: "sessionExpired" };
  return { kind: "retryable", error };
}

/**
 * HTTP 409 競合エラーかどうかを型ガード付きで判定する。
 */
export function isConflictApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 409;
}

/**
 * HTTP 401 認証エラーかどうかを型ガード付きで判定する。
 * セッション完全失効時に返される。リトライでは回復しないため非リトライ扱いとする。
 */
export function isAuthApiError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401;
}
