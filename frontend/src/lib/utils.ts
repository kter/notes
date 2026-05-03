/**
 * 汎用ユーティリティ関数をまとめたモジュール。
 * Tailwind クラス結合とコンテンツハッシュ計算を提供する。
 *
 * 主なエクスポート:
 * - cn: clsx + tailwind-merge によるクラス名結合
 * - calculateHash: SHA-256 ハッシュ文字列を返す非同期関数
 *
 * 呼び出し関係: UI コンポーネントおよびノートの変更検知ロジックから使用される。
 */
import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

/**
 * clsx でクラス名を結合し、tailwind-merge で重複ルールを解消して返す。
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * 文字列の SHA-256 ハッシュを 16 進数文字列で返す。
 * ノートコンテンツの変更検知（savedHashes 比較）に使用する。
 */
export async function calculateHash(content: string): Promise<string> {
  const msgBuffer = new TextEncoder().encode(content);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}
