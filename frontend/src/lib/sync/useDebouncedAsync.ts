/**
 * 非同期コールバックをデバウンスし、キャンセルと即時フラッシュをサポートするカスタムフック。
 * コールバックの最新参照を ref で保持することで、stale closure 問題を回避する。
 *
 * 主なエクスポート:
 * - useDebouncedAsync: デバウンス済み関数・cancel・flush を返すフック
 *
 * 呼び出し関係: useNoteSyncEngine から debouncedServerSync として使用される。
 */
"use client";

import { useCallback, useEffect, useRef } from "react";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDebouncedAsync<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
) {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const callbackRef = useRef(callback);
  // flush 時に最後に渡された引数を再利用するためにキャッシュする
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const lastArgsRef = useRef<any[] | null>(null);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  /**
   * 保留中のデバウンスタイマーをキャンセルする。コールバックは実行されない。
   */
  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  /**
   * 保留中のデバウンスを即時実行してタイマーをクリアする。
   * 保留がない場合は何もしない。コールバックの戻り値（Promise）をそのまま返す。
   */
  const flush = useCallback(() => {
    if (timeoutRef.current && lastArgsRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      const result = callbackRef.current(...lastArgsRef.current);
      lastArgsRef.current = null;
      return result;
    }
  }, []);

  /**
   * デバウンスされたコールバック関数。
   * 呼ばれるたびにタイマーをリセットし、delay ミリ秒後にコールバックを実行する。
   */
  const debounced = useCallback(
    (...args: Parameters<T>) => {
      lastArgsRef.current = args;
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        callbackRef.current(...args);
        lastArgsRef.current = null;
      }, delay);
    },
    [delay]
  );

  return { debounced, cancel, flush };
}
