"use client";

import { useState, useEffect, useCallback } from "react";

/**
 * ブール値を localStorage に永続化するフック。
 * SSR 安全: 初期値は defaultValue、マウント後に localStorage を読んで同期する。
 */
export function usePersistedBoolean(
  storageKey: string,
  defaultValue: boolean
): [boolean, (next: boolean | ((prev: boolean) => boolean)) => void] {
  const [value, setValue] = useState<boolean>(defaultValue);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const saved = window.localStorage.getItem(storageKey);
    if (saved === "true") setValue(true);
    else if (saved === "false") setValue(false);
  }, [storageKey]);

  const set = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setValue((prev) => {
        const resolved = typeof next === "function" ? next(prev) : next;
        if (typeof window !== "undefined") {
          window.localStorage.setItem(storageKey, String(resolved));
        }
        return resolved;
      });
    },
    [storageKey]
  );

  return [value, set];
}
