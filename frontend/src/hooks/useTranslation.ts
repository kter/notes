"use client";

/**
 * 翻訳キーを文字列に変換するユーティリティフック。
 * LanguageContext の translations オブジェクトからドット区切りパスで値を取得する。
 *
 * 主なエクスポート:
 * - useTranslation: t(path) 関数と言語設定関連の値を返すフック
 *
 * 呼び出し関係: UI コンポーネント全般、useOfflineSync、useAIChat から使用される。
 */

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

/**
 * LanguageContext から翻訳関数 t と言語状態を取り出して返す。
 * t(path) はドット区切りパスを受け取り、対応するロケール文字列を返す。
 * キーが存在しない場合はパス文字列をそのまま返す。
 */
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
