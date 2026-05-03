"use client";

/**
 * 認証済みAPIクライアントを提供するフック。
 * トークンの取得とクライアント生成をカプセル化し、手動トークン管理による競合状態を排除する。
 *
 * 主なエクスポート:
 * - useApi: 認証トークン付きAPIクライアントを返すフック
 *
 * 呼び出し関係: useFolders / useNotes / useOfflineSync など API を呼ぶすべてのフックから使用される。
 */

import { useCallback, useMemo } from "react";
import { useAuth } from "@/lib/auth-context";
import { createApiClient } from "@/lib/api";

/**
 * 現在の認証トークンを使ったAPIクライアントを非同期で返す。
 * `getApi()` を呼び出すたびに最新トークンを取得するため、トークン更新後も安全に使える。
 */
export function useApi() {
  const { getAccessToken } = useAuth();

  const getApi = useCallback(async () => {
    const token = await getAccessToken();
    return createApiClient(token);
  }, [getAccessToken]);

  return useMemo(() => ({ getApi }), [getApi]);
}
