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
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

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
  const [prevNoteId, setPrevNoteId] = useState(selectedNote?.id);
  const [prevFolderId, setPrevFolderId] = useState(selectedFolder?.id);

  const noteId = selectedNote?.id;
  const folderId = selectedFolder?.id;

  if (noteId !== prevNoteId || folderId !== prevFolderId) {
    setPrevNoteId(noteId);
    setPrevFolderId(folderId);
    if (noteId) {
      setScope("note");
    } else if (folderId) {
      setScope("folder");
    } else {
      setScope("all");
    }
  }

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
                    "max-w-[90%] rounded-2xl px-4 py-2 text-sm shadow-sm overflow-hidden",
                    msg.role === "user"
                      ? "bg-primary text-primary-foreground rounded-tr-none"
                      : "bg-muted rounded-tl-none border border-border/50"
                  )}
                >
                  {msg.role === "user" ? (
                    <p data-testid="user-message-content" className="whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                  ) : (
                    <div data-testid="ai-message-content" className="prose prose-sm dark:prose-invert max-w-none break-words">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Text styling
                          p: ({...props}) => <p className="mb-2 last:mb-0 leading-relaxed" {...props} />,
                          a: ({...props}) => <a className="text-primary hover:underline font-medium" target="_blank" rel="noopener noreferrer" {...props} />,
                          strong: ({...props}) => <strong className="font-semibold" {...props} />,
                          em: ({...props}) => <em className="italic" {...props} />,
                          
                          // Headings
                          h1: ({...props}) => <h1 className="text-lg font-bold mt-4 mb-2 first:mt-0" {...props} />,
                          h2: ({...props}) => <h2 className="text-base font-bold mt-3 mb-2" {...props} />,
                          h3: ({...props}) => <h3 className="text-sm font-semibold mt-3 mb-1" {...props} />,
                          
                          // Lists
                          ul: ({...props}) => <ul className="list-disc pl-4 mb-2 space-y-1" {...props} />,
                          ol: ({...props}) => <ol className="list-decimal pl-4 mb-2 space-y-1" {...props} />,
                          li: ({...props}) => <li className="pl-1" {...props} />,
                          
                          // Code blocks
                          code: ({className, children, ...props}) => {
                            const match = /language-(\w+)/.exec(className || '')
                            const isInline = !match && !String(children).includes('\n')
                            return isInline ? (
                              <code className="bg-muted-foreground/20 rounded px-1 py-0.5 font-mono text-xs" {...props}>
                                {children}
                              </code>
                            ) : (
                              <div className="relative my-2 rounded-md bg-muted-foreground/10 p-2 overflow-x-auto">
                                <code className={cn("font-mono text-xs block", className)} {...props}>
                                  {children}
                                </code>
                              </div>
                            )
                          },
                          pre: ({...props}) => <pre className="my-0 bg-transparent p-0 overflow-visible" {...props} />,
                          
                          // Other elements
                          blockquote: ({...props}) => <blockquote className="border-l-2 border-primary/50 pl-4 italic text-muted-foreground my-2" {...props} />,
                          hr: ({...props}) => <hr className="my-4 border-border" {...props} />,
                          table: ({...props}) => <div className="overflow-x-auto my-2"><table className="w-full text-left text-xs border-collapse" {...props} /></div>,
                          th: ({...props}) => <th className="border border-border px-2 py-1 font-semibold bg-muted/50" {...props} />,
                          td: ({...props}) => <td className="border border-border px-2 py-1" {...props} />,
                        }}
                      >
                        {msg.content}
                      </ReactMarkdown>
                    </div>
                  )}
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
            data-testid="ai-chat-send-button"
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
