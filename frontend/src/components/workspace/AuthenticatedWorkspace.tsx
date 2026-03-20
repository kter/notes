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
        onToggleSidebar={() => workspace.setIsSidebarOpen(!workspace.isSidebarOpen)}
        isNoteListOpen={workspace.isNoteListOpen}
        onToggleNoteList={() =>
          workspace.setIsNoteListOpen(!workspace.isNoteListOpen)
        }
        sidebar={
          <div className="flex flex-col h-full">
            <Sidebar
              folders={workspace.folders}
              selectedFolderId={workspace.selectedFolderId}
              onSelectFolder={workspace.handleSelectFolder}
              onCreateFolder={workspace.handleCreateFolder}
              onRenameFolder={workspace.handleRenameFolder}
              onDeleteFolder={workspace.handleDeleteFolder}
              onToggleCollapse={() =>
                workspace.setIsSidebarOpen(!workspace.isSidebarOpen)
              }
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
        onMobileViewChange={(view) => {
          workspace.setMobileView(view);
          workspace.setIsChatOpen(view === "chat");
        }}
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
            onToggleCollapse={() =>
              workspace.setIsNoteListOpen(!workspace.isNoteListOpen)
            }
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
              onSummarize={async (id) => {
                await workspace.triggerServerSync(id);
                await workspace.handleSummarize(id);
                workspace.setIsChatOpen(true);
                workspace.setMobileView("chat");
              }}
              onOpenChat={() => workspace.setIsChatOpen(!workspace.isChatOpen)}
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
              contentOverride={workspace.contentOverride}
              pendingEditProposal={pendingEditEntry?.message.editProposal ?? null}
              onAcceptEdit={
                pendingEditEntry
                  ? () => workspace.handleAcceptEditAndApply(pendingEditEntry.index)
                  : undefined
              }
              onRejectEdit={
                pendingEditEntry
                  ? () => workspace.handleRejectEdit(pendingEditEntry.index)
                  : undefined
              }
            />
            <AIChatPanel
              isOpen={workspace.isChatOpen}
              onClose={() => workspace.setIsChatOpen(!workspace.isChatOpen)}
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
              onSendEditRequest={(instruction, _content, noteId) =>
                workspace.handleSendEditRequest(
                  instruction,
                  workspace.getCurrentEditorContent(),
                  noteId
                )
              }
              onAcceptEdit={workspace.handleAcceptEditAndApply}
              onRejectEdit={workspace.handleRejectEdit}
              currentEditorContent=""
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
