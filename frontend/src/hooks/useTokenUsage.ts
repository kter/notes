"use client";

import { useState, useCallback, useEffect } from "react";
import { useApi } from "./useApi";
import type { TokenUsageRead } from "@/types";
import { useAuth } from "@/lib/auth-context";
import { logger } from "@/lib/logger";

export function useTokenUsage(isAuthenticated: boolean) {
    const { getApi } = useApi();
    const { isLoading: authLoading } = useAuth();
    const [tokenUsage, setTokenUsage] = useState<TokenUsageRead | null>(null);

    const fetchTokenUsage = useCallback(async () => {
        if (authLoading || !isAuthenticated) return;
        try {
            const apiClient = await getApi();
            const response = await apiClient.getSettings();
            if (response?.token_usage) {
                setTokenUsage(response.token_usage);
            }
        } catch (error) {
            logger.error("Failed to fetch token usage", error);
        }
    }, [authLoading, isAuthenticated, getApi]);

    useEffect(() => {
        void fetchTokenUsage();
    }, [fetchTokenUsage]);

    const recordUsage = useCallback((tokens: number) => {
        setTokenUsage((prev) =>
            prev
                ? {
                    ...prev,
                    tokens_used: prev.tokens_used + tokens,
                }
                : null
        );
    }, []);

    return { tokenUsage, fetchTokenUsage, recordUsage };
}
