/**
 * AWS Amplify の初期化とクライアントサイドへの提供を担うモジュール。
 * Cognito 認証設定を環境変数から構築し、子コンポーネントへ Amplify コンテキストを提供する。
 *
 * 主なエクスポート:
 * - AmplifyProvider: アプリケーション全体を包む Amplify 初期化プロバイダー
 *
 * 呼び出し関係: app レイアウトから使用され、内部で Amplify.configure() を呼び出す。
 */
"use client";

import { useEffect, useState, ReactNode } from "react";
import { Amplify, ResourcesConfig } from "aws-amplify";
import { logger } from "@/lib/logger";
import { isDevAuthBypass } from "@/lib/dev-bypass";

// Cognito configuration from environment variables
const amplifyConfig: ResourcesConfig = {
  Auth: {
    Cognito: {
      userPoolId: process.env.NEXT_PUBLIC_COGNITO_USER_POOL_ID || "",
      userPoolClientId: process.env.NEXT_PUBLIC_COGNITO_CLIENT_ID || "",
      loginWith: {
        email: true,
      },
      signUpVerificationMethod: "code",
      userAttributes: {
        email: {
          required: true,
        },
      },
      passwordFormat: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireNumbers: true,
        requireSpecialCharacters: true,
      },
    },
  },
};

/**
 * Amplify をクライアントサイドでのみ初期化し、子コンポーネントをレンダリングするプロバイダー。
 * SSR 時のハイドレーションミスマッチを防ぐため、初期化完了まで null を返す。
 */
export function AmplifyProvider({ children }: { children: ReactNode }) {
  const [isConfigured, setIsConfigured] = useState(false);

  useEffect(() => {
    if (isDevAuthBypass) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsConfigured(true);
      return;
    }
    // Configure Amplify only on client side
    try {
      Amplify.configure(amplifyConfig);
      setIsConfigured(true);
    } catch (error) {
      logger.error("Failed to configure Amplify", error);
      setIsConfigured(true); // Still render children
    }
  }, []);

  // Show nothing while configuring to prevent hydration mismatch
  if (!isConfigured) {
    return null;
  }

  return <>{children}</>;
}
