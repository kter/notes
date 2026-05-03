/**
 * エディタ上部のツールバーコンポーネント。
 * フォルダ移動・AI 要約・チャット・エクスポート・プレビュー切り替え・共有・フルスクリーンなどの操作を提供する。
 * 共有ダイアログの開閉と共有リンクの取得・作成・削除も内部で管理する。
 *
 * 主なエクスポート:
 * - EditorToolbar: エディタツールバーコンポーネント
 *
 * 呼び出し関係: EditorPanel から使用される。
 */
"use client";

import { memo, useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { SunlightMap } from "@/components/SunlightMap";
import type { Folder, NoteShare } from "@/types";
import {
  SparklesIcon,
  TrashIcon,
  MessageSquareIcon,
  FolderIcon,
  ChevronDownIcon,
  Loader2Icon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  Share2Icon,
  Maximize2Icon,
  Minimize2Icon,
  PrinterIcon,
} from "lucide-react";
import { useApi, useTranslation } from "@/hooks";
import { ShareDialog } from "@/components/ui/ShareDialog";

interface EditorToolbarProps {
  noteId: string;
  noteFolderId: string | null;
  folders: Folder[];
  currentFolder: Folder | undefined;
  isSummarizing: boolean;
  isChatOpen: boolean;
  isPreviewOpen: boolean;
  isDesktopViewport: boolean;
  isEditorCollapsed: boolean;
  isFullscreen: boolean;
  hasPendingEditProposal: boolean;
  // Stable refs for accessing live editor state without taking a content/title dep
  currentTitleRef: { current: string };
  currentContentRef: { current: string };
  lastSavedTitleRef: { current: string };
  lastSavedContentRef: { current: string };
  // Callbacks (all should be stable useCallback references from parent)
  onUpdateNote: (
    id: string,
    updates: { title?: string; content?: string; folder_id?: string | null }
  ) => void;
  onSummarize: (id: string) => void;
  onOpenChat: () => void;
  onPreviewToggle: () => void;
  onShowEditorPane: () => void;
  onHideEditorPane: () => void;
  onExportMarkdown: () => void;
  onExportText: () => void;
  onPrintPreview: () => void;
  onToggleFullscreen: () => void;
  onDeleteNote: (id: string) => void;
}

/**
 * ツールバー本体。
 * 未保存変更がある状態で AI 要約ボタンを押した場合、要約前に変更を強制保存してから onSummarize を呼ぶ。
 * ドロップダウンはクリック外で自動的に閉じる。
 */
export const EditorToolbar = memo(function EditorToolbar({
  noteId,
  noteFolderId,
  folders,
  currentFolder,
  isSummarizing,
  isChatOpen,
  isPreviewOpen,
  isDesktopViewport,
  isEditorCollapsed,
  isFullscreen,
  hasPendingEditProposal,
  currentTitleRef,
  currentContentRef,
  lastSavedTitleRef,
  lastSavedContentRef,
  onUpdateNote,
  onSummarize,
  onOpenChat,
  onPreviewToggle,
  onShowEditorPane,
  onHideEditorPane,
  onExportMarkdown,
  onExportText,
  onPrintPreview,
  onToggleFullscreen,
  onDeleteNote,
}: EditorToolbarProps) {
  const { getApi } = useApi();
  const { t } = useTranslation();
  const [isFolderDropdownOpen, setIsFolderDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isShareDialogOpen, setIsShareDialogOpen] = useState(false);
  const [isShareLoading, setIsShareLoading] = useState(false);
  const [currentShare, setCurrentShare] = useState<NoteShare | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const exportDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsFolderDropdownOpen(false);
      }
      if (exportDropdownRef.current && !exportDropdownRef.current.contains(event.target as Node)) {
        setIsExportDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleFolderChange = (folderId: string | null) => {
    onUpdateNote(noteId, { folder_id: folderId });
    setIsFolderDropdownOpen(false);
  };

  const handleSummarizeClick = () => {
    if (
      currentTitleRef.current !== lastSavedTitleRef.current ||
      currentContentRef.current !== lastSavedContentRef.current
    ) {
      const updates: { title?: string; content?: string } = {};
      if (currentTitleRef.current !== lastSavedTitleRef.current)
        updates.title = currentTitleRef.current;
      if (currentContentRef.current !== lastSavedContentRef.current)
        updates.content = currentContentRef.current;
      onUpdateNote(noteId, updates);
      lastSavedTitleRef.current = currentTitleRef.current;
      lastSavedContentRef.current = currentContentRef.current;
    }
    onSummarize(noteId);
  };

  return (
    <>
      <div className="flex items-center justify-between p-4 md:p-4 p-2 border-b border-border/50">
        <div className="flex items-center gap-1 md:gap-2 flex-wrap">
          {/* Folder Selector */}
          <div className="relative" ref={dropdownRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsFolderDropdownOpen(!isFolderDropdownOpen)}
              className="gap-1 md:gap-2"
              data-testid="editor-folder-dropdown"
            >
              <FolderIcon className="h-4 w-4" />
              <span className="max-w-[80px] md:max-w-[120px] truncate hidden sm:inline">
                {currentFolder?.name || t("sidebar.allNotes")}
              </span>
              <ChevronDownIcon className="h-3 w-3" />
            </Button>
            {isFolderDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                      !noteFolderId ? "bg-accent" : ""
                    }`}
                    onClick={() => handleFolderChange(null)}
                  >
                    {t("sidebar.allNotes")}
                  </button>
                  {folders.map((folder) => (
                    <button
                      key={folder.id}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-accent ${
                        noteFolderId === folder.id ? "bg-accent" : ""
                      }`}
                      onClick={() => handleFolderChange(folder.id)}
                    >
                      {folder.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
          {/* Summarize */}
          <Button
            variant="ghost"
            size="sm"
            onClick={handleSummarizeClick}
            disabled={isSummarizing}
            className="gap-1 md:gap-2"
            aria-label={t("editor.summarizeNote")}
            data-testid="editor-summarize-button"
          >
            {isSummarizing ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SparklesIcon className="h-4 w-4" />
            )}
            <span className="hidden md:inline">
              {isSummarizing ? t("editor.summarizing") : t("editor.summarize")}
            </span>
          </Button>
          {/* Chat Toggle */}
          <Button
            variant={isChatOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onOpenChat}
            className="gap-1 md:gap-2"
            aria-label={t("editor.toggleChat")}
            data-testid="editor-chat-button"
          >
            <MessageSquareIcon className="h-4 w-4" />
            <span className="hidden md:inline">{t("editor.chat")}</span>
          </Button>
          {/* Export Dropdown */}
          <div className="relative" ref={exportDropdownRef}>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setIsExportDropdownOpen(!isExportDropdownOpen)}
              className="gap-1 md:gap-2"
              aria-label={t("editor.exportNote")}
              data-testid="editor-export-dropdown"
            >
              <DownloadIcon className="h-4 w-4" />
              <span className="hidden md:inline">{t("editor.export")}</span>
              <ChevronDownIcon className="h-3 w-3" />
            </Button>
            {isExportDropdownOpen && (
              <div className="absolute top-full left-0 mt-1 w-48 bg-popover border border-border rounded-md shadow-lg z-50">
                <div className="py-1">
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => { onExportMarkdown(); setIsExportDropdownOpen(false); }}
                    data-testid="editor-export-markdown"
                  >
                    {t("editor.markdown")}
                  </button>
                  <button
                    className="w-full text-left px-3 py-2 text-sm hover:bg-accent"
                    onClick={() => { onExportText(); setIsExportDropdownOpen(false); }}
                  >
                    {t("editor.plainText")}
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* Preview Toggle */}
          <Button
            variant={isPreviewOpen ? "secondary" : "ghost"}
            size="sm"
            onClick={onPreviewToggle}
            className="gap-1 md:gap-2"
            data-testid="editor-preview-toggle"
            disabled={hasPendingEditProposal}
          >
            {isPreviewOpen ? (
              <EyeOffIcon className="h-4 w-4" />
            ) : (
              <EyeIcon className="h-4 w-4" />
            )}
            <span className="hidden md:inline">{t("editor.preview")}</span>
          </Button>
          {isPreviewOpen && !hasPendingEditProposal && (
            <Button
              variant="ghost"
              size="sm"
              onClick={
                isDesktopViewport
                  ? isEditorCollapsed
                    ? onShowEditorPane
                    : onHideEditorPane
                  : onPreviewToggle
              }
              className="gap-1"
              data-testid={
                isDesktopViewport
                  ? isEditorCollapsed
                    ? "editor-show-button"
                    : "editor-hide-button"
                  : "editor-show-button"
              }
            >
              <span>
                {isDesktopViewport
                  ? isEditorCollapsed
                    ? t("editor.showEditor")
                    : t("editor.hideEditor")
                  : t("editor.showEditor")}
              </span>
            </Button>
          )}
          {/* Print */}
          <Button
            variant="ghost"
            size="sm"
            onClick={onPrintPreview}
            className="gap-1 md:gap-2"
            aria-label={t("editor.printPreview")}
            data-testid="editor-print-button"
          >
            <PrinterIcon className="h-4 w-4" />
            <span className="hidden md:inline">{t("editor.print")}</span>
          </Button>
          {/* Share */}
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              setIsShareDialogOpen(true);
              setIsShareLoading(true);
              try {
                const api = await getApi();
                const share = await api.getNoteShare(noteId);
                setCurrentShare(share);
              } catch {
                setCurrentShare(null);
              } finally {
                setIsShareLoading(false);
              }
            }}
            className="gap-1 md:gap-2"
            aria-label={t("editor.shareNote")}
            data-testid="editor-share-button"
          >
            <Share2Icon className="h-4 w-4" />
            <span className="hidden md:inline">{t("editor.share")}</span>
          </Button>
        </div>
        <SunlightMap />
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={onToggleFullscreen}
            aria-label={isFullscreen ? t("editor.exitFullscreen") : t("editor.fullscreen")}
            data-testid="editor-fullscreen-button"
            title={isFullscreen ? t("editor.exitFullscreen") : t("editor.fullscreen")}
          >
            {isFullscreen ? (
              <Minimize2Icon className="h-4 w-4" />
            ) : (
              <Maximize2Icon className="h-4 w-4" />
            )}
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="text-destructive hover:text-destructive"
            onClick={() => {
              if (confirm(t("noteList.deleteConfirm"))) {
                onDeleteNote(noteId);
              }
            }}
            data-testid="editor-delete-note-button"
          >
            <TrashIcon className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <ShareDialog
        isOpen={isShareDialogOpen}
        onClose={() => setIsShareDialogOpen(false)}
        shareUrl={
          currentShare
            ? `${window.location.origin}/shared?token=${currentShare.share_token}`
            : null
        }
        isLoading={isShareLoading}
        onCreateShare={async () => {
          setIsShareLoading(true);
          try {
            const api = await getApi();
            const share = await api.createNoteShare(noteId);
            setCurrentShare(share);
          } finally {
            setIsShareLoading(false);
          }
        }}
        onRevokeShare={async () => {
          setIsShareLoading(true);
          try {
            const api = await getApi();
            await api.deleteNoteShare(noteId);
            setCurrentShare(null);
          } finally {
            setIsShareLoading(false);
          }
        }}
      />
    </>
  );
});
