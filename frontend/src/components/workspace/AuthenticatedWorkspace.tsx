/**
 * 認証済みユーザー向けのワークスペース全体を組み立てるコンポーネント。
 * useWorkspaceState が返すすべての状態・ハンドラを ThreeColumnLayout・EditorPanel・AIChatPanel に橋渡しする。
 *
 * 主なエクスポート:
 * - AuthenticatedWorkspace: ログイン済み状態で表示されるメインワークスペース
 *
 * 呼び出し関係: ルートページまたは認証フローの下層から使用される。
 */
"use client";

import { AIChatPanel } from "@/components/ai";
import {
  EditorPanel,
  NoteList,
  SettingsDialog,
  Sidebar,
  ThreeColumnLayout,
} from "@/components/layout";
import { SyncStatusIndicator } from "@/components/ui/SyncStatusIndicator";
import { WorkspaceSidebarFooter } from "@/components/workspace/WorkspaceSidebarFooter";
import { useTranslation } from "@/hooks";
import { useWorkspaceState } from "@/hooks/workspace/useWorkspaceState";

interface AuthenticatedWorkspaceProps {
  userEmail?: string;
  onSignOut: () => void | Promise<void>;
}

/**
 * ワークスペース本体。
 * データ読み込み中はローディングスクリーンを返し、完了後に三カラムレイアウトと各パネルを描画する。
 * AI Edit の pendingEditEntry を EditorPanel に渡して diff 表示・承認/却下フローを仲介する。
 */
export function AuthenticatedWorkspace({
  userEmail,
  onSignOut,
}: AuthenticatedWorkspaceProps) {
  const { t } = useTranslation();
  const workspace = useWorkspaceState(true);
  const pendingEditEntry = workspace.pendingEditEntry;

  if (workspace.isDataLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <div className="text-muted-foreground">{t("common.loading")}</div>
      </div>
    );
  }

  return (
    <>
      <ThreeColumnLayout
        isSidebarOpen={workspace.isSidebarOpen}
        onToggleSidebar={workspace.handleToggleSidebar}
        isNoteListOpen={workspace.isNoteListOpen}
        onToggleNoteList={workspace.handleToggleNoteList}
        sidebar={
          <div className="flex flex-col h-full">
            <Sidebar
              folders={workspace.folders}
              selectedFolderId={workspace.selectedFolderId}
              onSelectFolder={workspace.handleSelectFolder}
              onCreateFolder={workspace.handleCreateFolder}
              onRenameFolder={workspace.handleRenameFolder}
              onDeleteFolder={workspace.handleDeleteFolder}
              onToggleCollapse={workspace.handleToggleSidebar}
            />
            <WorkspaceSidebarFooter
              isSidebarOpen={workspace.isSidebarOpen}
              userEmail={userEmail}
              onOpenSettings={() => workspace.setIsSettingsOpen(true)}
              onSignOut={onSignOut}
            />
          </div>
        }
        mobileView={workspace.mobileView}
        onMobileViewChange={workspace.handleMobileViewChange}
        noteList={
          <NoteList
            notes={workspace.filteredNotes}
            selectedNoteId={workspace.selectedNoteId}
            onSelectNote={workspace.handleSelectNote}
            onCreateNote={workspace.handleCreateNote}
            folderName={workspace.selectedFolderName}
            folderId={workspace.selectedFolderId}
            onRenameFolder={workspace.handleRenameFolder}
            onDeleteFolder={workspace.handleDeleteFolder}
            searchQuery={workspace.searchQuery}
            onSearchChange={workspace.setSearchQuery}
            onToggleCollapse={workspace.handleToggleNoteList}
          />
        }
        editor={
          <div className="flex flex-1 h-full">
            <EditorPanel
              key={workspace.selectedNote?.id ?? "empty"}
              note={workspace.selectedNote}
              folders={workspace.folders}
              onUpdateNote={workspace.handleUpdateNote}
              onDeleteNote={workspace.handleDeleteNote}
              onSummarize={workspace.handleSummarizeNote}
              onOpenChat={workspace.handleToggleChat}
              isChatOpen={workspace.isChatOpen}
              isSummarizing={workspace.isAILoading}
              syncStatus={workspace.syncStatus}
              triggerServerSync={workspace.triggerServerSync}
              savedHash={
                workspace.selectedNote
                  ? workspace.savedHashes[workspace.selectedNote.id]
                  : undefined
              }
              tokenUsage={workspace.tokenUsage}
              onContentChange={workspace.handleEditorContentChange}
              onSelectionChange={workspace.handleEditorSelectionChange}
              contentOverride={workspace.contentOverride}
              pendingEditProposal={pendingEditEntry?.message.editProposal ?? null}
              onAcceptEdit={workspace.handlePendingAcceptEdit}
              onRejectEdit={workspace.handlePendingRejectEdit}
            />
            <AIChatPanel
              isOpen={workspace.isChatOpen}
              onClose={workspace.handleToggleChat}
              messages={workspace.chatMessages}
              onSendMessage={workspace.handleSendMessage}
              onClearChat={workspace.clearChat}
              isLoading={workspace.isAILoading}
              selectedNote={workspace.selectedNote}
              selectedFolder={workspace.selectedFolder}
              width={workspace.chatPanelResize.width}
              isResizing={workspace.chatPanelResize.isResizing}
              onResizeStart={workspace.chatPanelResize.handleMouseDown}
              isEditMode={workspace.isEditMode}
              onToggleEditMode={workspace.setIsEditMode}
              onSendEditRequest={workspace.handleSendEditRequestFromPanel}
              onAcceptEdit={workspace.handleAcceptEditAndApply}
              onRejectEdit={workspace.handleRejectEdit}
              getCurrentEditorContent={workspace.getCurrentEditorContent}
              subscribeToEditorSelectionChange={workspace.subscribeToEditorSelectionChange}
              getCurrentEditorSelectedText={workspace.getCurrentEditorSelectedText}
            />
          </div>
        }
      />
      <SyncStatusIndicator
        isOnline={workspace.isOnline}
        syncStatus={workspace.offlineSyncStatus}
        lastErrorMessage={workspace.offlineSyncErrorMessage}
        pendingChangesCount={workspace.pendingChangesCount}
        savedLocally={false}
        className="fixed bottom-20 md:bottom-4 right-4 z-50"
      />
      <SettingsDialog
        open={workspace.isSettingsOpen}
        onOpenChange={workspace.setIsSettingsOpen}
        tokenUsage={workspace.tokenUsage}
      />
    </>
  );
}
