"use client";

import { useEffect } from "react";
import { LandingPage } from "@/components/landing";
import { AuthenticatedWorkspace } from "@/components/workspace";
import { useAuth } from "@/lib/auth-context";
import { Loader2Icon } from "lucide-react";

export default function Home() {
  const { user, isLoading: authLoading, isAuthenticated, signOut } = useAuth();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const hostname = window.location.hostname;
    const isAdminHost = hostname === "admin.notes.devtools.site" || hostname === "admin.notes.dev.devtools.site";
    if (isAdminHost && window.location.pathname === "/") {
      window.location.replace("/admin/");
    }
  }, []);

  // Show loading while checking auth
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-background">
        <Loader2Icon className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Show landing page for unauthenticated users
  if (!isAuthenticated) {
    return <LandingPage />;
  }

  return <AuthenticatedWorkspace userEmail={user?.email} onSignOut={signOut} />;
}
