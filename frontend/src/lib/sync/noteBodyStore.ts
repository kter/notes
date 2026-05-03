/**
 * ノート本文 (content) をメモリ上に保持するモジュールレベルのストア。
 * notes[] React state にはメタデータと snippet のみを持たせ、
 * 大容量になりうる本文は React の再レンダリングサイクルから切り離すことで
 * エディタ入力ごとの不要な再レンダリングを防ぐ。
 *
 * 主なエクスポート:
 * - noteBodyStore: 命令的 API (get/set/delete/has/version/subscribe)
 * - useNoteBody: React コンポーネント向けフック (useSyncExternalStore ベース)
 *
 * アーキテクチャ上の重要な注意点:
 * - このストアはモジュールスコープのシングルトンであるため、
 *   コンポーネントのマウント/アンマウントに関係なく本文データが保持される。
 * - race condition 対策として、useNoteSyncEngine のコールバックは
 *   React state の notes[] ではなくこのストアから最新本文を参照することで、
 *   クロージャの stale 値を踏まない設計になっている。
 */

import { useSyncExternalStore } from "react";

type Listener = () => void;

/** noteId → 本文文字列 のマップ。モジュールスコープで一意 */
const bodies = new Map<string, string>();
/** 変更を購読しているリスナーのセット */
const listeners = new Set<Listener>();
/** set/delete のたびにインクリメントされる単調増加バージョン番号 */
let storeVersion = 0;

/**
 * 変更リスナーを登録する。useSyncExternalStore の subscribe 引数として渡す。
 * 返り値はアンサブスクライブ関数。
 */
function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** 登録済みリスナーを全て呼び出してストア変更を通知する */
function notify(): void {
  listeners.forEach((l) => l());
}

export const noteBodyStore = {
  /**
   * 指定 noteId の本文を返す。未登録の場合は空文字列を返す。
   */
  get(id: string): string {
    return bodies.get(id) ?? "";
  },

  /**
   * 指定 noteId の本文がストアに存在するかを返す。
   * get との違い: 未登録ノートの "" と、登録済みの空本文 "" を区別できる。
   */
  has(id: string): boolean {
    return bodies.has(id);
  },

  /**
   * 指定 noteId の本文を更新する。
   * 同一内容の場合は何もしない (不要な再レンダリングを防ぐ)。
   * 変更があった場合は storeVersion をインクリメントしてリスナーに通知する。
   */
  set(id: string, content: string): void {
    if (bodies.get(id) !== content) {
      bodies.set(id, content);
      storeVersion++;
      notify();
    }
  },

  /**
   * 指定 noteId の本文をストアから削除する。
   * ノート削除時のクリーンアップに使用する。
   */
  delete(id: string): void {
    if (bodies.has(id)) {
      bodies.delete(id);
      storeVersion++;
      notify();
    }
  },

  /**
   * 現在のストアバージョンを返す。
   * 外部から変更の有無を検知したい場合に使用する。
   */
  version(): number {
    return storeVersion;
  },

  subscribe,
};

/**
 * 指定 noteId の本文を React コンポーネントで購読するフック。
 * useSyncExternalStore を使うことで concurrent rendering 下でも
 * サーバー/クライアントの snapshot が一致し、tearing を防ぐ。
 * id が null/undefined の場合は空文字列を返す。
 */
export function useNoteBody(id: string | null | undefined): string {
  return useSyncExternalStore(
    subscribe,
    // クライアント側スナップショット
    () => (id ? bodies.get(id) ?? "" : ""),
    // サーバー側スナップショット (SSR 時に使用)
    () => (id ? bodies.get(id) ?? "" : "")
  );
}
