"use client";

import { useState, useCallback, useEffect } from "react";
import { useApi } from "./useApi";
import type { TokenUsageRead } from "@/types";

export function useTokenUsage(isAuthenticated: boolean) {
    const { getApi } = useApi();
    const [tokenUsage, setTokenUsage] = useState<TokenUsageRead | null>(null);

    const fetchTokenUsage = useCallback(async () => {
        if (!isAuthenticated) return;
        try {
            const apiClient = await getApi();
            const response = await apiClient.getSettings();
            if (response?.token_usage) {
                setTokenUsage(response.token_usage);
            }
        } catch (error) {
            console.error("Failed to fetch token usage:", error);
        }
    }, [isAuthenticated, getApi]);

    useEffect(() => {
        fetchTokenUsage();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isAuthenticated, getApi]);

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
