"use client";

/**
 * ワークスペースのナビゲーション状態（フォルダ/ノート選択・検索・URL 同期・絞り込み）を集約するフック。
 * 選択中エンティティの導出やコンテンツオーバーライドの管理もここで担う。
 *
 * 主なエクスポート:
 * - useWorkspaceNavigationState: 選択状態・検索・URL 連携・派生値を返す
 *
 * 呼び出し関係: useWorkspaceState から合成される。データ（folders/notes）と
 *   UI の setMobileView を依存として受け取る。
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

import type { MobileView } from "@/components/layout";
import { useNoteFilter } from "@/hooks/useNoteFilter";
import type { Folder, Note } from "@/types";

interface ContentOverride {
  noteId: string;
  content: string;
  version: number;
}

interface NavigationStateOptions {
  isDataLoading: boolean;
  folders: Folder[];
  notes: Note[];
  setMobileView: (view: MobileView) => void;
}

export function useWorkspaceNavigationState({
  isDataLoading,
  folders,
  notes,
  setMobileView,
}: NavigationStateOptions) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const urlNoteId = searchParams.get("note");
  const urlFolderId = searchParams.get("folder");

  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [contentOverride, setContentOverride] = useState<ContentOverride | null>(
    null
  );

  /** ?folder=<id>&?note=<id> を含む URL 文字列を生成するヘルパー。 */
  const buildHref = useCallback(
    (folderId: string | null, noteId: string | null) => {
      const params = new URLSearchParams();
      if (folderId) params.set("folder", folderId);
      if (noteId) params.set("note", noteId);
      const qs = params.toString();
      return qs ? `${pathname}?${qs}` : pathname;
    },
    [pathname]
  );

  // URL クエリパラメータから選択状態を復元する。
  // isDataLoading が true の間は folders/notes が未確定なので ID の有効性を検証できない。
  // prev との比較は、同一値での setState を省略して不要な再レンダーを防ぐため。
  useEffect(() => {
    if (isDataLoading) return;
    const validFolderId =
      urlFolderId && folders.some((f) => f.id === urlFolderId) ? urlFolderId : null;
    const validNoteId =
      urlNoteId && notes.some((n) => n.id === urlNoteId) ? urlNoteId : null;

    setSelectedFolderId((prev) => (prev !== validFolderId ? validFolderId : prev));
    setSelectedNoteId((prev) => {
      if (prev === validNoteId) return prev;
      setContentOverride(null);
      if (validNoteId) setMobileView("editor");
      return validNoteId;
    });
  }, [urlFolderId, urlNoteId, isDataLoading, folders, notes, setMobileView]);

  const handleSelectFolder = useCallback(
    (id: string | null) => {
      setSelectedFolderId(id);
      setSearchQuery("");
      setMobileView("notes");
      router.push(buildHref(id, selectedNoteId), { scroll: false });
    },
    [router, buildHref, selectedNoteId, setMobileView]
  );

  const handleSelectNote = useCallback(
    (id: string | null) => {
      setSelectedNoteId(id);
      setContentOverride(null);
      if (id) setMobileView("editor");
      router.push(buildHref(selectedFolderId, id), { scroll: false });
    },
    [router, buildHref, selectedFolderId, setMobileView]
  );

  const selectedNote = useMemo(
    () => notes.find((note) => note.id === selectedNoteId) ?? null,
    [notes, selectedNoteId]
  );
  const selectedFolder = useMemo(
    () => folders.find((folder) => folder.id === selectedFolderId) ?? null,
    [folders, selectedFolderId]
  );
  const selectedFolderName = selectedFolder?.name;
  const filteredNotes = useNoteFilter(notes, selectedFolderId, searchQuery);

  return {
    selectedFolderId,
    setSelectedFolderId,
    selectedNoteId,
    searchQuery,
    setSearchQuery,
    contentOverride,
    setContentOverride,
    buildHref,
    handleSelectFolder,
    handleSelectNote,
    selectedNote,
    selectedFolder,
    selectedFolderName,
    filteredNotes,
  };
}
