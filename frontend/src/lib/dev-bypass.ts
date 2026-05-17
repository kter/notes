/**
 * ローカル開発・AI エージェント検証用の認証バイパス定数。
 * NEXT_PUBLIC_DEV_AUTH_BYPASS=true かつ NEXT_PUBLIC_ENVIRONMENT !== "prd" のときのみ有効。
 * 本番ビルドでは絶対に true にならない (二段ガード)。
 */

export const BYPASS_TOKEN = "local-dev-token";

export const BYPASS_USER = {
  userId: "local-dev-user-id",
  username: "local-dev-user",
  email: "local-dev-user@example.com",
} as const;

export const isDevAuthBypass =
  process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === "true" &&
  process.env.NEXT_PUBLIC_ENVIRONMENT !== "prd";
