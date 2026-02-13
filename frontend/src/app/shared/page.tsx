"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSharedNote, ApiError } from "@/lib/api";
import type { SharedNote } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2Icon } from "lucide-react";

function SharedNoteContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");

  const [note, setNote] = useState<SharedNote | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchNote() {
      if (!token) {
        setError("Invalid share link - no token provided");
        setIsLoading(false);
        return;
      }

      try {
        const sharedNote = await getSharedNote(token);
        setNote(sharedNote);
      } catch (err) {
        if (err instanceof ApiError) {
          if (err.status === 404) {
            setError("This shared note was not found or has been revoked.");
          } else if (err.status === 410) {
            setError("This share link has expired.");
          } else {
            setError("Failed to load the shared note.");
          }
        } else {
          setError("Failed to load the shared note.");
        }
      } finally {
        setIsLoading(false);
      }
    }

    fetchNote();
  }, [token]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !note) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Not Found</h1>
          <p className="text-muted-foreground">{error || "This shared note could not be loaded."}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
        {/* Header */}
        <header className="mb-8 pb-6 border-b">
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-4">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
              Shared Note
            </span>
            <span>•</span>
            <span>Read-only</span>
          </div>
          <h1 className="text-3xl font-bold text-foreground">
            {note.title || "Untitled"}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">
            Last updated: {new Date(note.updated_at).toLocaleDateString(undefined, {
              year: "numeric",
              month: "long",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </p>
        </header>

        {/* Content */}
        <div className="markdown-preview prose prose-sm dark:prose-invert max-w-none">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {note.content || "*No content*"}
          </ReactMarkdown>
        </div>

        {/* Footer */}
        <footer className="mt-12 pt-6 border-t text-center text-sm text-muted-foreground">
          <p>This is a shared view of a note. The content is read-only.</p>
        </footer>
      </div>
    </div>
  );
}

export default function SharedNotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <SharedNoteContent />
    </Suspense>
  );
}
