/**
 * useEditorDisplayMode のユニットテスト。
 * localStorage の読み書き、デフォルト値 "raw"、SSR 安全性を検証する。
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useEditorDisplayMode } from "./useEditorDisplayMode";

const STORAGE_KEY = "editor-display-mode";

describe("useEditorDisplayMode", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("returns 'raw' as the default mode when localStorage is empty", () => {
    const { result } = renderHook(() => useEditorDisplayMode());
    expect(result.current.mode).toBe("raw");
  });

  it("reads persisted 'live-preview' mode from localStorage on mount", async () => {
    localStorage.setItem(STORAGE_KEY, "live-preview");
    const { result, rerender } = renderHook(() => useEditorDisplayMode());
    // After useEffect runs
    await act(async () => {});
    rerender();
    expect(result.current.mode).toBe("live-preview");
  });

  it("reads persisted 'raw' mode from localStorage on mount", async () => {
    localStorage.setItem(STORAGE_KEY, "raw");
    const { result } = renderHook(() => useEditorDisplayMode());
    await act(async () => {});
    expect(result.current.mode).toBe("raw");
  });

  it("ignores unknown values in localStorage and keeps default 'raw'", async () => {
    localStorage.setItem(STORAGE_KEY, "unknown-value");
    const { result } = renderHook(() => useEditorDisplayMode());
    await act(async () => {});
    expect(result.current.mode).toBe("raw");
  });

  it("setMode updates the state and persists to localStorage", () => {
    const { result } = renderHook(() => useEditorDisplayMode());
    act(() => {
      result.current.setMode("live-preview");
    });
    expect(result.current.mode).toBe("live-preview");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("live-preview");
  });

  it("setMode can switch back to 'raw'", () => {
    const { result } = renderHook(() => useEditorDisplayMode());
    act(() => {
      result.current.setMode("live-preview");
    });
    act(() => {
      result.current.setMode("raw");
    });
    expect(result.current.mode).toBe("raw");
    expect(localStorage.getItem(STORAGE_KEY)).toBe("raw");
  });
});
