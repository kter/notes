"use client";

import { useCallback } from "react";
import { useAuth } from "@/lib/auth-context";
import { createApiClient } from "@/lib/api";

/**
 * Hook that provides an API client with the current user's authentication token.
 * This eliminates race conditions from manual token management.
 */
export function useApi() {
  const { getAccessToken } = useAuth();

  const getApi = useCallback(async () => {
    const token = await getAccessToken();
    return createApiClient(token);
  }, [getAccessToken]);

  return { getApi };
}
