"use client";

import { Button } from "@/components/ui/button";
import { 
  FileTextIcon, 
  SparklesIcon, 
  FolderIcon, 
  MessageSquareIcon,
  ArrowRightIcon 
} from "lucide-react";
import Link from "next/link";

export function LandingPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-zinc-900 via-zinc-800 to-zinc-900">
      {/* Header */}
      <header className="container mx-auto px-6 py-6">
        <nav className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileTextIcon className="h-8 w-8 text-primary" />
            <span className="text-xl font-bold">Notes</span>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/login">
              <Button variant="ghost">Sign In</Button>
            </Link>
            <Link href="/register">
              <Button>Get Started</Button>
            </Link>
          </div>
        </nav>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-6 py-20">
        <div className="text-center max-w-3xl mx-auto">
          <h1 className="text-5xl md:text-6xl font-bold mb-6 bg-gradient-to-r from-white to-zinc-400 bg-clip-text text-transparent">
            Your Notes, Supercharged with AI
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            A beautiful, Mac-inspired notes app with AI-powered summarization and Q&A. 
            Organize your thoughts, get instant insights.
          </p>
          <div className="flex gap-4 justify-center">
            <Link href="/register">
              <Button size="lg" className="gap-2">
                Start for Free
                <ArrowRightIcon className="h-4 w-4" />
              </Button>
            </Link>
            <Link href="/login">
              <Button size="lg" variant="outline">
                Sign In
              </Button>
            </Link>
          </div>
        </div>

        {/* Features Grid */}
        <div className="grid md:grid-cols-3 gap-8 mt-24">
          <FeatureCard
            icon={<FolderIcon className="h-8 w-8" />}
            title="Organize with Folders"
            description="Keep your notes organized with a familiar folder structure, just like Mac Notes."
          />
          <FeatureCard
            icon={<SparklesIcon className="h-8 w-8" />}
            title="AI Summarization"
            description="Get instant AI-powered summaries of your notes with a single click."
          />
          <FeatureCard
            icon={<MessageSquareIcon className="h-8 w-8" />}
            title="Chat with Your Notes"
            description="Ask questions about your notes and get intelligent answers powered by Claude."
          />
        </div>
      </main>

      {/* Footer */}
      <footer className="container mx-auto px-6 py-8 mt-20 border-t border-border/50">
        <p className="text-center text-muted-foreground text-sm">
          Built with Next.js, FastAPI, and Amazon Bedrock
        </p>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-6 rounded-xl bg-zinc-800/50 border border-zinc-700/50 hover:border-zinc-600/50 transition-colors">
      <div className="text-primary mb-4">{icon}</div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}
