"use client";

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from "react";
import { ja, en, type TranslationKeys, type Language } from "@/locales";
import { useApi } from "@/hooks";
import { useAuth } from "@/lib/auth-context";

interface LanguageContextType {
  language: Language;
  effectiveLanguage: "ja" | "en";
  setLanguage: (language: Language) => void;
  translations: TranslationKeys;
  isLoading: boolean;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

function detectBrowserLanguage(): "ja" | "en" {
  if (typeof window === "undefined") return "en";
  const lang = navigator.language || navigator.languages?.[0] || "en";
  return lang.startsWith("ja") ? "ja" : "en";
}

function getTranslations(effectiveLanguage: "ja" | "en"): TranslationKeys {
  return effectiveLanguage === "ja" ? ja : en;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const { getApi } = useApi();
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [language, setLanguageState] = useState<Language>("auto");
  const [isLoading, setIsLoading] = useState(true);

  // Load language setting from backend on mount
  useEffect(() => {
    let isActive = true;

    async function loadLanguage() {
      if (authLoading) {
        return;
      }

      if (!isAuthenticated) {
        if (!isActive) {
          return;
        }

        setLanguageState("auto");
        setIsLoading(false);
        return;
      }

      try {
        const apiClient = await getApi();
        const response = await apiClient.getSettings();
        if (!isActive) {
          return;
        }

        setLanguageState(response.settings.language as Language);
      } catch (error) {
        if (!isActive) {
          return;
        }

        console.error("Failed to load language settings:", error);
        // Fall back to auto
        setLanguageState("auto");
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    }

    void loadLanguage();

    return () => {
      isActive = false;
    };
  }, [authLoading, getApi, isAuthenticated]);

  const setLanguage = useCallback((newLanguage: Language) => {
    setLanguageState(newLanguage);
  }, []);

  const effectiveLanguage = useMemo((): "ja" | "en" => {
    if (language === "auto") {
      return detectBrowserLanguage();
    }
    return language;
  }, [language]);

  const translations = useMemo(() => {
    return getTranslations(effectiveLanguage);
  }, [effectiveLanguage]);

  const value = useMemo(
    () => ({
      language,
      effectiveLanguage,
      setLanguage,
      translations,
      isLoading,
    }),
    [language, effectiveLanguage, setLanguage, translations, isLoading]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage(): LanguageContextType {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useLanguage must be used within a LanguageProvider");
  }
  return context;
}
