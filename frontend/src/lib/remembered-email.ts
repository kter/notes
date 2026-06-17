/**
 * 直近にログインしたメールアドレスを localStorage に記憶するモジュール。
 * パスキーの擬似ワンクリック（再訪ユーザーがメール入力なしでパスキー認証へ進む）に利用する。
 * メールアドレスは資格情報ではないため平文保存で問題ない。
 *
 * 主なエクスポート:
 * - getRememberedEmail: 記憶済みメールを取得（無ければ空文字）
 * - rememberEmail: ログイン成功時にメールを保存
 * - clearRememberedEmail: 記憶を消去
 */
const STORAGE_KEY = "notes:last-email";

/** 記憶済みのメールアドレスを返す。SSR / localStorage 不可時は空文字。 */
export function getRememberedEmail(): string {
  if (typeof window === "undefined") return "";
  try {
    return window.localStorage.getItem(STORAGE_KEY) ?? "";
  } catch {
    return "";
  }
}

/** ログイン成功時にメールアドレスを記憶する。空文字は無視する。 */
export function rememberEmail(email: string): void {
  if (typeof window === "undefined" || !email) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, email);
  } catch {
    /* localStorage が使えなくても致命的ではないので無視 */
  }
}

/** 記憶済みのメールアドレスを消去する。 */
export function clearRememberedEmail(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* 同上 */
  }
}
