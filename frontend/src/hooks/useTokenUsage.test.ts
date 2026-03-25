import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getApiMock = vi.fn();
const useAuthMock = vi.fn();

vi.mock("./useApi", () => ({
  useApi: () => ({
    getApi: getApiMock,
  }),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => useAuthMock(),
}));

import { useTokenUsage } from "./useTokenUsage";

describe("useTokenUsage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("waits for auth to finish before requesting settings", () => {
    useAuthMock.mockReturnValue({ isLoading: true });

    renderHook(() => useTokenUsage(true));

    expect(getApiMock).not.toHaveBeenCalled();
  });

  it("loads token usage once the user is authenticated", async () => {
    const getSettingsMock = vi.fn().mockResolvedValue({
      token_usage: {
        tokens_used: 12,
        monthly_limit: 1000,
      },
    });

    useAuthMock.mockReturnValue({ isLoading: false });
    getApiMock.mockResolvedValue({
      getSettings: getSettingsMock,
    });

    const { result } = renderHook(() => useTokenUsage(true));

    await waitFor(() => {
      expect(result.current.tokenUsage).toEqual({
        tokens_used: 12,
        monthly_limit: 1000,
      });
    });

    expect(getApiMock).toHaveBeenCalledTimes(1);
    expect(getSettingsMock).toHaveBeenCalledTimes(1);
  });
});
