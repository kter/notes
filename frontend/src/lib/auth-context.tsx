/**
 * AWS Cognito を利用した認証状態管理モジュール。
 * サインイン・サインアップ・サインアウトとアクセストークン取得のインターフェースを提供する。
 *
 * 主なエクスポート:
 * - AuthProvider: 認証コンテキストを提供するプロバイダコンポーネント
 * - useAuth: 認証コンテキストを取得するカスタムフック
 *
 * 呼び出し関係: app レイアウトで AuthProvider をラップし、各コンポーネントから useAuth で利用する。
 */
"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  ReactNode,
} from "react";
import {
  signIn,
  signUp,
  signOut,
  confirmSignUp,
  getCurrentUser,
  fetchAuthSession,
  type SignInInput,
  type SignUpInput,
  type ConfirmSignUpInput,
} from "aws-amplify/auth";
import { logger } from "@/lib/logger";

interface User {
  userId: string;
  username: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<{ needsConfirmation: boolean }>;
  confirmSignUp: (email: string, code: string) => Promise<void>;
  signOut: () => Promise<void>;
  getAccessToken: () => Promise<string | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

/**
 * 認証状態を管理し、子コンポーネントに AuthContext を提供するプロバイダ。
 * マウント時にセッションを確認し、ユーザー情報を state に反映する。
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /**
   * Cognito の現在ユーザーを取得して state を更新する。
   * サインイン後にも呼び出してセッションを再取得する。
   */
  const checkUser = useCallback(async () => {
    try {
      const currentUser = await getCurrentUser();
      setUser({
        userId: currentUser.userId,
        username: currentUser.username,
        email: currentUser.signInDetails?.loginId,
      });
    } catch {
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    checkUser();
  }, [checkUser]);

  useEffect(() => {
    logger.setUser(user?.userId ?? null);
  }, [user]);

  /** メールアドレスとパスワードでサインインし、ユーザー情報を再取得する。 */
  const handleSignIn = async (email: string, password: string) => {
    const input: SignInInput = { username: email, password };
    await signIn(input);
    await checkUser();
  };

  /**
   * 新規アカウントを作成する。
   * 確認コードが必要な場合は needsConfirmation: true を返す。
   */
  const handleSignUp = async (email: string, password: string) => {
    const input: SignUpInput = {
      username: email,
      password,
      options: {
        userAttributes: { email },
      },
    };
    const result = await signUp(input);
    return { needsConfirmation: !result.isSignUpComplete };
  };

  const handleConfirmSignUp = async (email: string, code: string) => {
    const input: ConfirmSignUpInput = { username: email, confirmationCode: code };
    await confirmSignUp(input);
  };

  const handleSignOut = async () => {
    await signOut();
    setUser(null);
  };

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    try {
      const session = await fetchAuthSession();
      return session.tokens?.idToken?.toString() || null;
    } catch {
      return null;
    }
  }, []);

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
        isAuthenticated: !!user,
        signIn: handleSignIn,
        signUp: handleSignUp,
        confirmSignUp: handleConfirmSignUp,
        signOut: handleSignOut,
        getAccessToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
