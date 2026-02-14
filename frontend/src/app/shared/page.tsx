"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { getSharedNote, ApiError } from "@/lib/api";
import type { SharedNote } from "@/types";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Loader2Icon } from "lucide-react";

import Link from "next/link";
import { Button } from "@/components/ui/button";

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
      <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-foreground mb-4">Not Found</h1>
          <p className="text-muted-foreground mb-8">{error || "This shared note could not be loaded."}</p>
          <div className="flex justify-center gap-4">
            <Button asChild>
              <Link href="/">Go to Home</Link>
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navigation Bar for Unauthenticated Users */}
      <nav className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 h-14 flex items-center justify-between">
          <Link href="/" className="font-bold text-lg flex items-center gap-2">
            Notes App
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">Log In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/register">Sign Up Free</Link>
            </Button>
          </div>
        </div>
      </nav>

      <div className="flex-1">
        <div className="max-w-4xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          {/* Header */}
          <header className="mb-8 pb-6 border-b">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                  Shared Note
                </span>
                <span>•</span>
                <span>Read-only</span>
              </div>
            </div>

            <h1 className="text-3xl sm:text-4xl font-bold text-foreground mb-2 break-words">
              {note.title || "Untitled"}
            </h1>
            <p className="text-sm text-muted-foreground">
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
          <article className="markdown-preview prose prose-sm sm:prose-base dark:prose-invert max-w-none mb-16">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {note.content || "*No content*"}
            </ReactMarkdown>
          </article>

          {/* Call to Action Banner */}
          <div className="rounded-xl border bg-card p-6 sm:p-8 text-center sm:text-left relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-10 pointer-events-none">
              <svg
                width="120"
                height="120"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>

            <div className="relative z-10 flex flex-col sm:flex-row items-center justify-between gap-6">
              <div className="max-w-lg">
                <h3 className="text-xl font-semibold mb-2">Create your own notes with AI</h3>
                <p className="text-muted-foreground mb-0">
                  Join thousands of users organizing their thoughts with our AI-powered note-taking app.
                  Auto-tagging, summarization, and smart search included for free.
                </p>
              </div>
              <div className="flex flex-col sm:flex-row gap-3 w-full sm:w-auto">
                <Button size="lg" asChild className="w-full sm:w-auto">
                  <Link href="/register">Get Started Free</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer */}
      <footer className="border-t py-8 bg-muted/30">
        <div className="max-w-4xl mx-auto px-4 text-center text-sm text-muted-foreground">
          <p>© {new Date().getFullYear()} Notes App. All rights reserved.</p>
          <div className="mt-2 flex justify-center gap-4">
            <Link href="/" className="hover:text-foreground transition-colors">Home</Link>
            <Link href="/register" className="hover:text-foreground transition-colors">Sign Up</Link>
            <Link href="/login" className="hover:text-foreground transition-colors">Log In</Link>
          </div>
        </div>
      </footer>
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
