import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from "@/components/ui/select";
import type { ChatMessage, Note, Folder } from "@/types";
import type { ChatScope } from "@/hooks/useAIChat";
import { 
  SendIcon, 
  Loader2Icon, 
  SparklesIcon, 
  Trash2Icon,
  ChevronRightIcon,
  ChevronLeftIcon,
  FileTextIcon,
  FolderIcon,
  GlobeIcon
} from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";
import { useTranslation } from "@/hooks";

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (
    message: string, 
    scope: ChatScope, 
    noteId?: string | null, 
    folderId?: string | null
  ) => void;
  onClearChat: () => void;
  isLoading: boolean;
  selectedNote: Note | null;
  selectedFolder: Folder | null;
  width?: number;
  isResizing?: boolean;
  onResizeStart?: (e: React.MouseEvent) => void;
}

export function AIChatPanel({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  onClearChat,
  isLoading,
  selectedNote,
  selectedFolder,
  width,
  isResizing,
  onResizeStart,
}: AIChatPanelProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const [scope, setScope] = useState<ChatScope>("note");
  const scrollRef = useRef<HTMLDivElement>(null);

  // Default scope to "note" if a note is selected, otherwise "all"
  useEffect(() => {
    if (selectedNote) {
      setScope("note");
    } else if (selectedFolder) {
      setScope("folder");
    } else {
      setScope("all");
    }
  }, [selectedNote?.id, selectedFolder?.id]);

  useEffect(() => {
    if (scrollRef.current) {
      const scrollContainer = scrollRef.current.querySelector('[data-radix-scroll-area-viewport]');
      if (scrollContainer) {
        scrollContainer.scrollTop = scrollContainer.scrollHeight;
      }
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(
        input.trim(), 
        scope, 
        scope === "note" ? selectedNote?.id : null,
        scope === "folder" ? (selectedFolder?.id || selectedNote?.folder_id) : null
      );
      setInput("");
    }
  };

  if (!isOpen) {
    return (
      <div className="border-l border-border/50 flex flex-col items-center py-4 bg-card/30 w-12 hidden md:flex">
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 text-muted-foreground"
          onClick={onClose}
          title={t("ai.openAIChat")}
        >
          <ChevronLeftIcon className="h-4 w-4" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full">
      {/* Resize Handle - only on desktop */}
      {onResizeStart && (
        <div
          className="hidden md:block w-1 bg-border/30 hover:bg-primary/50 active:bg-primary/70 transition-colors cursor-col-resize flex-shrink-0"
          onMouseDown={onResizeStart}
        />
      )}
      <div
        className={cn(
          "border-l border-border/50 flex flex-col h-full overflow-hidden",
          // Only apply transition when not resizing
          !isResizing && "transition-all duration-300 ease-in-out",
          // Desktop: resizable width, subtle background
          "md:bg-card/50",
          // Mobile: full screen overlay, solid background
          "fixed md:relative inset-0 md:inset-auto w-full z-40 md:z-auto bg-background md:bg-transparent pb-14 md:pb-0"
        )}
        style={width ? { width: `${width}px` } : { width: '320px' }}
      >
      {/* Header */}
      <div className="p-4 border-b border-border/50">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <SparklesIcon className="h-4 w-4 text-primary" />
            <h3 className="font-semibold text-sm">{t("ai.title")}</h3>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-muted-foreground hover:text-destructive"
              onClick={onClearChat}
              title={t("ai.clearChat")}
            >
              <Trash2Icon className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={onClose}
            >
              <ChevronRightIcon className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Scope Selector */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-[10px] uppercase font-bold text-muted-foreground tracking-wider">
              {t("ai.chatContext")}
            </label>
          </div>
          <Select value={scope} onValueChange={(v) => setScope(v as ChatScope)}>
            <SelectTrigger className="w-full h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="note">
                <div className="flex items-center gap-2">
                  <FileTextIcon className="h-3 w-3" />
                  <span>{t("ai.currentNote")}</span>
                </div>
              </SelectItem>
              <SelectItem value="folder">
                <div className="flex items-center gap-2">
                  <FolderIcon className="h-3 w-3" />
                  <span>{t("ai.currentFolder")}</span>
                </div>
              </SelectItem>
              <SelectItem value="all">
                <div className="flex items-center gap-2">
                  <GlobeIcon className="h-3 w-3" />
                  <span>{t("ai.allNotes")}</span>
                </div>
              </SelectItem>
            </SelectContent>
          </Select>
          
          {/* Context indicator */}
          <div className="text-[11px] text-muted-foreground truncate px-1">
            {scope === "note" && (selectedNote ? (selectedNote.title || t("ai.untitled")) : t("ai.noNoteSelected"))}
            {scope === "folder" && (selectedFolder?.name || t("ai.noFolderSelected"))}
            {scope === "all" && t("ai.allNotesAndFolders")}
          </div>
        </div>
      </div>

      {/* Chat messages */}
      <ScrollArea className="flex-1 min-h-0 p-4" ref={scrollRef}>
        <div className="space-y-4">
          {messages.length === 0 ? (
            <div className="text-center py-12 px-4">
              <div className="bg-primary/10 w-12 h-12 rounded-full flex items-center justify-center mx-auto mb-4">
                <SparklesIcon className="h-6 w-6 text-primary" />
              </div>
              <p className="text-sm font-medium mb-1">{t("ai.howCanIHelp")}</p>
              <p className="text-xs text-muted-foreground">
                {scope === "all" ? t("ai.askAboutNotes") : scope === "folder" ? t("ai.askAboutFolder") : t("ai.askAboutNote")}
              </p>
            </div>
          ) : (
            messages?.map((msg, idx) => (
              <div
                key={idx}
                className={cn(
                  "flex",
                  msg.role === "user" ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[90%] rounded-2xl px-4 py-2 text-sm shadow-sm",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted rounded-tl-none border border-border/50"
                  )}
                >
                  <p data-testid="ai-message-content" className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                </div>
              </div>
            ))
          )}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-2xl rounded-tl-none px-4 py-3 border border-border/50 shadow-sm">
                <div className="flex gap-1" data-testid="ai-loading">
                  <span className="w-1.5 h-1.5 bg-foreground/20 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-1.5 h-1.5 bg-foreground/20 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-1.5 h-1.5 bg-foreground/20 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t border-border/50 bg-background/50 backdrop-blur-sm">
        <div className="flex gap-2 items-end bg-background rounded-xl border border-border p-2 focus-within:border-primary/50 transition-colors shadow-sm">
          <Textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              scope === "note" ? t("ai.askAboutCurrentNote") :
              scope === "folder" ? t("ai.askAboutThisFolder") :
              t("ai.askAboutAllNotes")
            }
            onKeyDown={(e) => {
              if (e.nativeEvent.isComposing) return;
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSend();
              }
            }}
            disabled={isLoading}
            className="flex-1 min-h-[40px] max-h-[200px] border-none shadow-none focus-visible:ring-0 px-2 py-1 resize-none text-sm"
            rows={1}
          />
          <Button
            size="icon"
            className="h-8 w-8 rounded-lg"
            onClick={handleSend}
            disabled={!input.trim() || isLoading}
          >
            {isLoading ? (
              <Loader2Icon className="h-4 w-4 animate-spin" />
            ) : (
              <SendIcon className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
      </div>
    </div>
  );
}
