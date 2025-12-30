"use client";

import { useCallback } from "react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { TranslationKeys } from "@/locales";

type NestedKeyOf<T> = T extends object
  ? {
      [K in keyof T]: K extends string
        ? T[K] extends object
          ? `${K}.${NestedKeyOf<T[K]>}` | K
          : K
        : never;
    }[keyof T]
  : never;

type TranslationPath = NestedKeyOf<TranslationKeys>;

function getNestedValue(obj: Record<string, unknown>, path: string): string {
  const keys = path.split(".");
  let result: unknown = obj;
  for (const key of keys) {
    if (result && typeof result === "object" && key in result) {
      result = (result as Record<string, unknown>)[key];
    } else {
      return path; // Return path if not found
    }
  }
  return typeof result === "string" ? result : path;
}

export function useTranslation() {
  const { translations, effectiveLanguage, language, setLanguage, isLoading } = useLanguage();

  const t = useCallback(
    (path: TranslationPath): string => {
      return getNestedValue(translations as unknown as Record<string, unknown>, path);
    },
    [translations]
  );

  return {
    t,
    language,
    effectiveLanguage,
    setLanguage,
    isLoading,
  };
}
