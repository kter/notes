/**
 * ログインページ。メールアドレスとパスワードによる Cognito 認証フローを提供する。
 *
 * 主なエクスポート:
 * - LoginPage: ログインフォームページコンポーネント
 *
 * 呼び出し関係: Next.js App Router の `/login` ルート (app/login/page.tsx)。
 */
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/lib/auth-context";
import { FileTextIcon, Loader2Icon, KeyRoundIcon } from "lucide-react";
import { isDevAuthBypass } from "@/lib/dev-bypass";

/**
 * ログインフォームコンポーネント。送信時に signIn を呼び出し、成功するとルートへリダイレクトする。
 * エラー発生時はフォーム内にエラーメッセージを表示し、ローディング中はボタンを無効化する。
 */
export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [passkeySupported, setPasskeySupported] = useState(false);
  const { signIn, signInWithPasskey } = useAuth();
  const router = useRouter();
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDevAuthBypass) router.replace("/");
  }, [router]);

  // WebAuthn 非対応ブラウザではパスキーボタンを表示しない。
  useEffect(() => {
    setPasskeySupported(
      typeof window !== "undefined" && !!window.PublicKeyCredential
    );
  }, []);

  // パスワードログイン。メール・パスワード両方を JS で検証する
  // （HTML5 の required には頼らず、パスキー経路に干渉させない）。
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setError("Enter your email and password");
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      await signIn(email, password);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed");
    } finally {
      setIsLoading(false);
    }
  };

  // パスキーログインはメールのみで完了する（パスワードは不要）。
  const handlePasskeySignIn = async () => {
    if (!email) {
      setError("Enter your email above, then tap the passkey button");
      emailRef.current?.focus();
      return;
    }
    setError(null);
    setIsLoading(true);

    try {
      await signInWithPasskey(email);
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey sign in failed");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      <div className="w-full max-w-md p-8">
        {/* Logo */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <FileTextIcon className="h-10 w-10 text-primary" />
          <span className="text-2xl font-bold">Notes</span>
        </div>

        {/* Form Card */}
        <div className="bg-zinc-800/50 rounded-xl border border-zinc-700/50 p-8">
          <h1 className="text-2xl font-bold text-center mb-2">Welcome back</h1>
          <p className="text-muted-foreground text-center mb-6">
            Sign in to your account
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium mb-2">
                Email
              </label>
              <Input
                ref={emailRef}
                id="email"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading}
                data-testid="login-email-input"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium mb-2">
                Password
              </label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={isLoading}
                data-testid="login-password-input"
              />
            </div>

            {error && (
              <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-sm">
                {error}
              </div>
            )}

            <Button
              type="submit"
              className="w-full"
              disabled={isLoading}
              data-testid="login-submit-button"
            >
              {isLoading ? (
                <>
                  <Loader2Icon className="h-4 w-4 animate-spin mr-2" />
                  Signing in...
                </>
              ) : (
                "Sign In"
              )}
            </Button>
          </form>

          {passkeySupported && (
            <>
              <div className="my-6 flex items-center gap-3">
                <div className="h-px flex-1 bg-zinc-700/50" />
                <span className="text-xs text-muted-foreground">or</span>
                <div className="h-px flex-1 bg-zinc-700/50" />
              </div>
              <Button
                type="button"
                variant="outline"
                className="w-full"
                onClick={handlePasskeySignIn}
                disabled={isLoading}
                data-testid="login-passkey-button"
              >
                <KeyRoundIcon className="h-4 w-4 mr-2" />
                Sign in with a passkey
              </Button>
              <p className="mt-2 text-center text-xs text-muted-foreground">
                Just your email — no password needed
              </p>
            </>
          )}

          <div className="mt-6 text-center text-sm">
            <span className="text-muted-foreground">Don&apos;t have an account? </span>
            <Link href="/register" className="text-primary hover:underline" data-testid="login-signup-link">
              Sign up
            </Link>
          </div>
        </div>

        <div className="mt-4 text-center">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
            ← Back to home
          </Link>
        </div>
      </div>
    </div>
  );
}
