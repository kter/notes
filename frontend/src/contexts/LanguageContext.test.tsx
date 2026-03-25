import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getApiMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("@/hooks", () => ({
  useApi: () => ({
    getApi: getApiMock,
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

import { LanguageProvider, useLanguage } from "./LanguageContext";

function LanguageConsumer() {
  const { isLoading, language } = useLanguage();

  return (
    <>
      <span data-testid="loading">{String(isLoading)}</span>
      <span data-testid="language">{language}</span>
    </>
  );
}

describe("LanguageProvider", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("skips loading settings while unauthenticated", async () => {
    useAuthMock.mockReturnValue({
      isAuthenticated: false,
      isLoading: false,
    });

    render(
      <LanguageProvider>
        <LanguageConsumer />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(screen.getByTestId("language")).toHaveTextContent("auto");
    expect(getApiMock).not.toHaveBeenCalled();
  });

  it("loads the persisted language after authentication is ready", async () => {
    const getSettingsMock = vi.fn().mockResolvedValue({
      settings: {
        language: "ja",
      },
    });

    useAuthMock.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
    });
    getApiMock.mockResolvedValue({
      getSettings: getSettingsMock,
    });

    render(
      <LanguageProvider>
        <LanguageConsumer />
      </LanguageProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId("language")).toHaveTextContent("ja");
      expect(screen.getByTestId("loading")).toHaveTextContent("false");
    });

    expect(getApiMock).toHaveBeenCalledTimes(1);
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
  });
});
