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
import { isDevAuthBypass, BYPASS_TOKEN, BYPASS_USER } from "@/lib/dev-bypass";

interface User {
  userId: string;
  username: string;
  email?: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  sessionExpired: boolean;
  notifySessionExpired: () => void;
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
  const [user, setUser] = useState<User | null>(
    isDevAuthBypass ? { ...BYPASS_USER } : null
  );
  const [isLoading, setIsLoading] = useState(!isDevAuthBypass);
  const [sessionExpired, setSessionExpired] = useState(false);

  /**
   * Cognito の現在ユーザーを取得して state を更新する。
   * サインイン後にも呼び出してセッションを再取得する。
   */
  const checkUser = useCallback(async () => {
    if (isDevAuthBypass) return;
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

  /** セッション失効フラグを立てる。autosave / オフラインキューから呼ばれる。 */
  const notifySessionExpired = useCallback(() => {
    setSessionExpired(true);
  }, []);

  /** メールアドレスとパスワードでサインインし、ユーザー情報を再取得する。 */
  const handleSignIn = async (email: string, password: string) => {
    if (isDevAuthBypass) return;
    // セッション失効中は Amplify のローカルストレージに古いセッションが残っており、
    // signIn() を呼ぶと UserAlreadyAuthenticatedException が発生する。
    // 先に signOut() で Amplify セッションをクリアしてから再サインインする。
    if (sessionExpired) {
      try { await signOut(); } catch { /* 旧セッションのクリアに失敗しても続行 */ }
    }
    const input: SignInInput = { username: email, password };
    await signIn(input);
    setSessionExpired(false);
    await checkUser();
  };

  /**
   * 新規アカウントを作成する。
   * 確認コードが必要な場合は needsConfirmation: true を返す。
   */
  const handleSignUp = async (email: string, password: string) => {
    if (isDevAuthBypass) return { needsConfirmation: false };
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
    if (isDevAuthBypass) return;
    const input: ConfirmSignUpInput = { username: email, confirmationCode: code };
    await confirmSignUp(input);
  };

  const handleSignOut = async () => {
    if (isDevAuthBypass) return;
    await signOut();
    setUser(null);
    setSessionExpired(false);
  };

  const getAccessToken = useCallback(async (): Promise<string | null> => {
    if (isDevAuthBypass) return BYPASS_TOKEN;
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
        sessionExpired,
        notifySessionExpired,
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
