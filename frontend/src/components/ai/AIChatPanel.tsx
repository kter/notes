"use client";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { ChatMessage } from "@/types";
import { SendIcon, XIcon, Loader2Icon, SparklesIcon } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/utils";

interface AIChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  messages: ChatMessage[];
  onSendMessage: (message: string) => void;
  isLoading: boolean;
  summary: string | null;
  onClearSummary: () => void;
}

export function AIChatPanel({
  isOpen,
  onClose,
  messages,
  onSendMessage,
  isLoading,
  summary,
  onClearSummary,
}: AIChatPanelProps) {
  const [input, setInput] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSend = () => {
    if (input.trim() && !isLoading) {
      onSendMessage(input.trim());
      setInput("");
    }
  };

  if (!isOpen && !summary) return null;

  return (
    <div className={cn(
      "border-l border-border/50 flex flex-col bg-card/50",
      // Desktop: fixed width sidebar
      "md:w-80",
      // Mobile: full screen overlay
      "fixed md:relative inset-0 md:inset-auto w-full md:w-80 z-40 md:z-auto"
    )}>
      {/* Header */}
      <div className="p-4 border-b border-border/50 flex items-center justify-between">
        <h3 className="font-semibold text-sm">AI Assistant</h3>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={() => {
            onClose();
            onClearSummary();
          }}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>

      {/* Summary section */}
      {summary && (
        <div className="p-4 border-b border-border/50 bg-primary/5">
          <div className="flex items-center gap-2 mb-2">
            <SparklesIcon className="h-4 w-4 text-primary" />
            <span className="text-sm font-medium">Summary</span>
          </div>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">
            {summary}
          </p>
        </div>
      )}

      {/* Chat messages */}
      {isOpen && (
        <>
          <ScrollArea className="flex-1 p-4" ref={scrollRef}>
            <div className="space-y-4">
              {messages.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Ask questions about this note...
                </p>
              ) : (
                messages.map((msg, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex",
                      msg.role === "user" ? "justify-end" : "justify-start"
                    )}
                  >
                    <div
                      className={cn(
                        "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                        msg.role === "user"
                          ? "bg-primary text-primary-foreground"
                          : "bg-muted"
                      )}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>
                  </div>
                ))
              )}
              {isLoading && (
                <div className="flex justify-start">
                  <div className="bg-muted rounded-lg px-3 py-2">
                    <Loader2Icon className="h-4 w-4 animate-spin" />
                  </div>
                </div>
              )}
            </div>
          </ScrollArea>

          {/* Input */}
          <div className="p-4 border-t border-border/50">
            <div className="flex gap-2 items-end">
              <Textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about this note... (Shift+Enter for newline)"
                onKeyDown={(e) => {
                  // Skip handling during IME composition (e.g., Japanese input)
                  if (e.nativeEvent.isComposing) return;
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    handleSend();
                  }
                  // Shift+Enter allows default behavior (newline)
                }}
                disabled={isLoading}
                className="flex-1 min-h-[40px] max-h-[120px] resize-none"
                rows={1}
              />
              <Button
                size="icon"
                onClick={handleSend}
                disabled={!input.trim() || isLoading}
              >
                <SendIcon className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
