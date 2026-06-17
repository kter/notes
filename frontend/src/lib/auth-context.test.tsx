import * as Sentry from "@sentry/nextjs";
import { render, renderHook, screen, waitFor } from "@testing-library/react";
import {
  signIn,
  associateWebAuthnCredential,
  listWebAuthnCredentials,
  deleteWebAuthnCredential,
} from "aws-amplify/auth";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthProvider, useAuth } from "./auth-context";

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <AuthProvider>{children}</AuthProvider>
);

function AuthConsumer() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <div>loading</div>;
  }

  return <div>{user?.userId ?? "anonymous"}</div>;
}

describe("AuthProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("binds the authenticated user id to Sentry", async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("test-user-id")).toBeInTheDocument();
    });

    await waitFor(() => {
      expect(Sentry.setUser).toHaveBeenLastCalledWith({ id: "test-user-id" });
    });
  });
});

describe("AuthProvider passkeys", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("signs in with a passkey via the USER_AUTH / WEB_AUTHN flow", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.signInWithPasskey("user@example.com");

    expect(signIn).toHaveBeenCalledWith({
      username: "user@example.com",
      options: { authFlowType: "USER_AUTH", preferredChallenge: "WEB_AUTHN" },
    });
  });

  it("registers a passkey via associateWebAuthnCredential", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.registerPasskey();

    expect(associateWebAuthnCredential).toHaveBeenCalledTimes(1);
  });

  it("lists registered passkeys", async () => {
    vi.mocked(listWebAuthnCredentials).mockResolvedValueOnce({
      credentials: [
        {
          credentialId: "cred-1",
          friendlyCredentialName: "MacBook",
          relyingPartyId: "notes.dev.devtools.site",
          authenticatorTransports: ["internal"],
          createdAt: new Date("2026-06-01T00:00:00Z"),
        },
      ],
    });

    const { result } = renderHook(() => useAuth(), { wrapper });

    const credentials = await result.current.listPasskeys();

    expect(credentials).toHaveLength(1);
    expect(credentials[0].credentialId).toBe("cred-1");
  });

  it("deletes a passkey by credential id", async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await result.current.deletePasskey("cred-1");

    expect(deleteWebAuthnCredential).toHaveBeenCalledWith({ credentialId: "cred-1" });
  });
});
