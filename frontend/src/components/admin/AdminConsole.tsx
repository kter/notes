"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2Icon, LogOutIcon, RefreshCwIcon, SearchIcon, ShieldAlertIcon } from "lucide-react";
import Link from "next/link";

import type {
  AdminUserDetailResponse,
  AdminUserSummary,
} from "@/types";
import { ApiError } from "@/lib/api";
import { useApi } from "@/hooks";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

function formatDate(date: string | null): string {
  if (!date) return "-";
  return new Intl.DateTimeFormat(undefined, {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(date));
}

function formatNumber(value: number): string {
  return new Intl.NumberFormat().format(value);
}

function usageRatio(detail: AdminUserDetailResponse | null): number {
  if (!detail || detail.token_usage.token_limit <= 0) return 0;
  return detail.token_usage.tokens_used / detail.token_usage.token_limit;
}

export function AdminConsole() {
  const { isAuthenticated, isLoading: authLoading, signOut, user } = useAuth();
  const { getApi } = useApi();

  const [isCheckingAdmin, setIsCheckingAdmin] = useState(true);
  const [hasAdminAccess, setHasAdminAccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [adminFilter, setAdminFilter] = useState<"all" | "admins" | "users">("all");
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [detail, setDetail] = useState<AdminUserDetailResponse | null>(null);
  const [isListLoading, setIsListLoading] = useState(false);
  const [isDetailLoading, setIsDetailLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  const [formAdmin, setFormAdmin] = useState(false);
  const [formLanguage, setFormLanguage] = useState("auto");
  const [formModelId, setFormModelId] = useState("");
  const [formTokenLimit, setFormTokenLimit] = useState("30000");

  useEffect(() => {
    if (authLoading) return;
    if (!isAuthenticated) {
      setIsCheckingAdmin(false);
      setHasAdminAccess(false);
      return;
    }

    let active = true;
    async function checkAccess() {
      setIsCheckingAdmin(true);
      try {
        const apiClient = await getApi();
        await apiClient.getAdminMe();
        if (!active) return;
        setHasAdminAccess(true);
      } catch (error) {
        if (!active) return;
        if (error instanceof ApiError && error.status === 403) {
          setHasAdminAccess(false);
        } else {
          setListError("管理者情報の確認に失敗しました。");
        }
      } finally {
        if (active) setIsCheckingAdmin(false);
      }
    }

    checkAccess();
    return () => {
      active = false;
    };
  }, [authLoading, getApi, isAuthenticated]);

  useEffect(() => {
    if (!hasAdminAccess) return;
    let active = true;

    async function loadUsers() {
      setIsListLoading(true);
      setListError(null);
      try {
        const apiClient = await getApi();
        const response = await apiClient.listAdminUsers({
          q: searchQuery.trim() || undefined,
          admin_only: adminFilter === "all" ? undefined : adminFilter === "admins",
          limit: 50,
        });
        if (!active) return;
        setUsers(response.users);
        setSelectedUserId((current) => {
          if (current && response.users.some((item) => item.user.user_id === current)) {
            return current;
          }
          return response.users[0]?.user.user_id ?? null;
        });
      } catch {
        if (active) {
          setListError("ユーザー一覧の取得に失敗しました。");
        }
      } finally {
        if (active) setIsListLoading(false);
      }
    }

    loadUsers();
    return () => {
      active = false;
    };
  }, [adminFilter, getApi, hasAdminAccess, searchQuery]);

  useEffect(() => {
    if (!hasAdminAccess || !selectedUserId) {
      setDetail(null);
      return;
    }
    let active = true;
    const currentUserId = selectedUserId;

    async function loadDetail() {
      setIsDetailLoading(true);
      setDetailError(null);
      try {
        const apiClient = await getApi();
        const response = await apiClient.getAdminUser(currentUserId);
        if (!active) return;
        setDetail(response);
      } catch {
        if (active) {
          setDetailError("ユーザー詳細の取得に失敗しました。");
        }
      } finally {
        if (active) setIsDetailLoading(false);
      }
    }

    loadDetail();
    return () => {
      active = false;
    };
  }, [getApi, hasAdminAccess, selectedUserId]);

  useEffect(() => {
    if (!detail) return;
    setFormAdmin(detail.user.admin);
    setFormLanguage(detail.settings.language);
    setFormModelId(detail.settings.llm_model_id);
    setFormTokenLimit(String(detail.settings.token_limit));
    setSaveMessage(null);
  }, [detail]);

  const canSave = useMemo(() => {
    if (!detail) return false;
    return (
      formAdmin !== detail.user.admin
      || formLanguage !== detail.settings.language
      || formModelId !== detail.settings.llm_model_id
      || formTokenLimit !== String(detail.settings.token_limit)
    );
  }, [detail, formAdmin, formLanguage, formModelId, formTokenLimit]);

  async function refreshList() {
    setSearchQuery((value) => value);
    const apiClient = await getApi();
    const response = await apiClient.listAdminUsers({
      q: searchQuery.trim() || undefined,
      admin_only: adminFilter === "all" ? undefined : adminFilter === "admins",
      limit: 50,
    });
    setUsers(response.users);
  }

  async function handleSave() {
    if (!detail) return;
    const tokenLimit = Number(formTokenLimit);
    if (!Number.isInteger(tokenLimit) || tokenLimit < 1) {
      setSaveMessage("トークン上限は 1 以上の整数で入力してください。");
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      const apiClient = await getApi();
      const updated = await apiClient.updateAdminUser(detail.user.user_id, {
        admin: formAdmin,
        language: formLanguage,
        llm_model_id: formModelId,
        token_limit: tokenLimit,
      });
      setDetail(updated);
      setUsers((current) =>
        current.map((item) =>
          item.user.user_id === updated.user.user_id
            ? {
                user: updated.user,
                settings: updated.settings,
                token_usage: updated.token_usage,
                note_count: updated.note_count,
                folder_count: updated.folder_count,
                mcp_token_count: updated.mcp_token_count,
              }
            : item
        )
      );
      setSaveMessage("更新しました。");
    } catch (error) {
      if (error instanceof ApiError && typeof error.data === "object" && error.data && "detail" in error.data) {
        setSaveMessage(String(error.data.detail));
      } else {
        setSaveMessage("更新に失敗しました。");
      }
    } finally {
      setIsSaving(false);
    }
  }

  if (authLoading || isCheckingAdmin) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-stone-800 bg-stone-900/80 p-8 text-center space-y-4">
          <h1 className="text-2xl font-semibold">管理画面</h1>
          <p className="text-sm text-stone-400">ログインすると管理画面にアクセスできます。</p>
          <Button asChild>
            <a href="/login/">ログインへ</a>
          </Button>
        </div>
      </div>
    );
  }

  if (!hasAdminAccess) {
    return (
      <div className="min-h-screen bg-stone-950 text-stone-100 flex items-center justify-center p-6">
        <div className="max-w-md rounded-3xl border border-rose-900/60 bg-stone-900/80 p-8 text-center space-y-4">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-rose-500/10 text-rose-300">
            <ShieldAlertIcon className="h-7 w-7" />
          </div>
          <h1 className="text-2xl font-semibold">アクセスできません</h1>
          <p className="text-sm text-stone-400">この画面は `admin` 権限を持つユーザーだけが利用できます。</p>
          <div className="flex justify-center gap-3">
            <Button variant="outline" onClick={() => signOut()}>
              <LogOutIcon className="mr-2 h-4 w-4" />
              ログアウト
            </Button>
            <Button asChild>
              <Link href="/">通常画面へ</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,#312e81_0%,#0c0a09_45%,#09090b_100%)] text-stone-100">
      <div className="mx-auto flex min-h-screen max-w-7xl flex-col px-4 py-6 md:px-8">
        <header className="mb-6 flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/20 p-5 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.3em] text-amber-300/70">Notes Admin</p>
            <h1 className="mt-2 text-3xl font-semibold">利用者管理</h1>
            <p className="mt-1 text-sm text-stone-300">
              {user?.email ?? "admin"} としてログイン中
            </p>
          </div>
          <div className="flex gap-3">
            <Button variant="outline" onClick={() => void refreshList()}>
              <RefreshCwIcon className="mr-2 h-4 w-4" />
              再読み込み
            </Button>
            <Button variant="outline" onClick={() => signOut()}>
              <LogOutIcon className="mr-2 h-4 w-4" />
              ログアウト
            </Button>
          </div>
        </header>

        <div className="grid flex-1 gap-6 lg:grid-cols-[380px_minmax(0,1fr)]">
          <section className="rounded-3xl border border-white/10 bg-black/20 p-4 backdrop-blur">
            <div className="mb-4 flex gap-3">
              <div className="relative flex-1">
                <SearchIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-500" />
                <Input
                  value={searchQuery}
                  onChange={(event) => setSearchQuery(event.target.value)}
                  placeholder="メールアドレス / user_id で検索"
                  className="border-white/10 bg-white/5 pl-9 text-stone-50"
                />
              </div>
              <select
                value={adminFilter}
                onChange={(event) => setAdminFilter(event.target.value as "all" | "admins" | "users")}
                className="rounded-md border border-white/10 bg-white/5 px-3 text-sm text-stone-100"
              >
                <option value="all">全員</option>
                <option value="admins">管理者のみ</option>
                <option value="users">一般ユーザーのみ</option>
              </select>
            </div>

            {listError && <p className="mb-3 text-sm text-rose-300">{listError}</p>}

            <div className="space-y-3">
              {isListLoading && (
                <div className="flex items-center justify-center py-6 text-stone-400">
                  <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />
                  読み込み中
                </div>
              )}

              {!isListLoading && users.length === 0 && (
                <div className="rounded-2xl border border-dashed border-white/10 px-4 py-8 text-center text-sm text-stone-400">
                  該当するユーザーがいません。
                </div>
              )}

              {users.map((item) => {
                const isSelected = item.user.user_id === selectedUserId;
                const ratio = item.token_usage.token_limit > 0
                  ? item.token_usage.tokens_used / item.token_usage.token_limit
                  : 0;
                return (
                  <button
                    key={item.user.user_id}
                    type="button"
                    onClick={() => setSelectedUserId(item.user.user_id)}
                    className={`w-full rounded-2xl border p-4 text-left transition ${
                      isSelected
                        ? "border-amber-400/70 bg-amber-400/10"
                        : "border-white/10 bg-white/5 hover:border-white/30"
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-medium">{item.user.email ?? item.user.user_id}</p>
                        <p className="mt-1 text-xs text-stone-400">{item.user.user_id}</p>
                      </div>
                      {item.user.admin && (
                        <span className="rounded-full bg-amber-400/15 px-2 py-1 text-xs text-amber-200">
                          admin
                        </span>
                      )}
                    </div>
                    <div className="mt-4 space-y-2 text-xs text-stone-300">
                      <div className="flex items-center justify-between">
                        <span>Token</span>
                        <span>{formatNumber(item.token_usage.tokens_used)} / {formatNumber(item.settings.token_limit)}</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-white/10">
                        <div
                          className={`h-full rounded-full ${
                            ratio >= 0.9 ? "bg-rose-400" : ratio >= 0.7 ? "bg-amber-400" : "bg-emerald-400"
                          }`}
                          style={{ width: `${Math.min(100, ratio * 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-stone-400">
                        <span>ノート {item.note_count}</span>
                        <span>最終接触 {formatDate(item.user.last_seen_at)}</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-3xl border border-white/10 bg-black/20 p-5 backdrop-blur">
            {!selectedUserId && (
              <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-dashed border-white/10 text-stone-400">
                ユーザーを選択してください。
              </div>
            )}

            {selectedUserId && isDetailLoading && (
              <div className="flex min-h-[320px] items-center justify-center text-stone-400">
                <Loader2Icon className="mr-2 h-5 w-5 animate-spin" />
                ユーザー詳細を読み込み中
              </div>
            )}

            {detailError && !isDetailLoading && (
              <div className="rounded-2xl border border-rose-900/60 bg-rose-500/10 p-4 text-sm text-rose-200">
                {detailError}
              </div>
            )}

            {detail && !isDetailLoading && (
              <div className="space-y-6">
                <div className="flex flex-col gap-3 border-b border-white/10 pb-5 md:flex-row md:items-end md:justify-between">
                  <div>
                    <h2 className="text-2xl font-semibold">{detail.user.email ?? detail.user.user_id}</h2>
                    <p className="mt-1 text-sm text-stone-400">{detail.user.user_id}</p>
                  </div>
                  <div className="grid gap-2 text-sm text-stone-300 md:grid-cols-2">
                    <div>作成日: {formatDate(detail.user.created_at)}</div>
                    <div>最終接触: {formatDate(detail.user.last_seen_at)}</div>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-4">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Token usage</p>
                    <p className="mt-3 text-2xl font-semibold">
                      {formatNumber(detail.token_usage.tokens_used)}
                    </p>
                    <p className="mt-1 text-sm text-stone-400">
                      / {formatNumber(detail.settings.token_limit)}
                    </p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Notes</p>
                    <p className="mt-3 text-2xl font-semibold">{detail.note_count}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400">Folders</p>
                    <p className="mt-3 text-2xl font-semibold">{detail.folder_count}</p>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <p className="text-xs uppercase tracking-[0.2em] text-stone-400">MCP keys</p>
                    <p className="mt-3 text-2xl font-semibold">{detail.mcp_token_count}</p>
                  </div>
                </div>

                <div className="rounded-2xl border border-white/10 bg-white/5 p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold">管理可能な設定</h3>
                    <div className="text-sm text-stone-400">
                      使用率 {(usageRatio(detail) * 100).toFixed(1)}%
                    </div>
                  </div>

                  <div className="grid gap-5 md:grid-cols-2">
                    <label className="space-y-2 text-sm">
                      <span className="text-stone-300">トークン上限</span>
                      <Input
                        type="number"
                        min={1}
                        value={formTokenLimit}
                        onChange={(event) => setFormTokenLimit(event.target.value)}
                        className="border-white/10 bg-black/20 text-stone-50"
                      />
                    </label>

                    <label className="space-y-2 text-sm">
                      <span className="text-stone-300">AI モデル</span>
                      <select
                        value={formModelId}
                        onChange={(event) => setFormModelId(event.target.value)}
                        className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-stone-100"
                      >
                        {detail.available_models.map((model) => (
                          <option key={model.id} value={model.id}>
                            {model.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="space-y-2 text-sm">
                      <span className="text-stone-300">言語</span>
                      <select
                        value={formLanguage}
                        onChange={(event) => setFormLanguage(event.target.value)}
                        className="w-full rounded-md border border-white/10 bg-black/20 px-3 py-2 text-stone-100"
                      >
                        {detail.available_languages.map((language) => (
                          <option key={language.id} value={language.id}>
                            {language.name}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="flex items-center gap-3 rounded-2xl border border-white/10 bg-black/20 px-4 py-3 text-sm">
                      <input
                        type="checkbox"
                        checked={formAdmin}
                        onChange={(event) => setFormAdmin(event.target.checked)}
                        className="h-4 w-4 rounded border-white/20 bg-black/20"
                      />
                      <span>管理者権限を付与する</span>
                    </label>
                  </div>

                  {saveMessage && (
                    <p className={`mt-4 text-sm ${saveMessage === "更新しました。" ? "text-emerald-300" : "text-rose-300"}`}>
                      {saveMessage}
                    </p>
                  )}

                  <div className="mt-6 flex justify-end">
                    <Button onClick={() => void handleSave()} disabled={!canSave || isSaving}>
                      {isSaving && <Loader2Icon className="mr-2 h-4 w-4 animate-spin" />}
                      保存
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
