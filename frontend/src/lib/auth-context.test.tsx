import * as Sentry from "@sentry/nextjs";
import { render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { AuthProvider, useAuth } from "./auth-context";

function AuthConsumer() {
  const { isLoading, user } = useAuth();

  if (isLoading) {
    return <div>loading</div>;
  }

  return <div>{user?.userId ?? "anonymous"}</div>;
}

describe("AuthProvider", () => {
  it("binds the authenticated user id to Sentry", async () => {
    render(
      <AuthProvider>
        <AuthConsumer />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByText("test-user-id")).toBeInTheDocument();
    });

    expect(Sentry.setUser).toHaveBeenCalledWith({ id: "test-user-id" });
  });
});
