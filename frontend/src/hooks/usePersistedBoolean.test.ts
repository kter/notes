/**
 * usePersistedBoolean のユニットテスト。
 * localStorage の読み書き、デフォルト値、SSR 安全性、関数形セッタを検証する。
 */
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import { usePersistedBoolean } from "./usePersistedBoolean";

const KEY = "test-bool-key";

describe("usePersistedBoolean", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("returns defaultValue when localStorage is empty", () => {
    const { result } = renderHook(() => usePersistedBoolean(KEY, true));
    expect(result.current[0]).toBe(true);
  });

  it("returns false as defaultValue when specified", () => {
    const { result } = renderHook(() => usePersistedBoolean(KEY, false));
    expect(result.current[0]).toBe(false);
  });

  it("reads persisted 'true' from localStorage on mount", async () => {
    localStorage.setItem(KEY, "true");
    const { result } = renderHook(() => usePersistedBoolean(KEY, false));
    await act(async () => {});
    expect(result.current[0]).toBe(true);
  });

  it("reads persisted 'false' from localStorage on mount", async () => {
    localStorage.setItem(KEY, "false");
    const { result } = renderHook(() => usePersistedBoolean(KEY, true));
    await act(async () => {});
    expect(result.current[0]).toBe(false);
  });

  it("ignores unknown values in localStorage and keeps defaultValue", async () => {
    localStorage.setItem(KEY, "unknown");
    const { result } = renderHook(() => usePersistedBoolean(KEY, true));
    await act(async () => {});
    expect(result.current[0]).toBe(true);
  });

  it("setter updates state and persists to localStorage", () => {
    const { result } = renderHook(() => usePersistedBoolean(KEY, true));
    act(() => {
      result.current[1](false);
    });
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");
  });

  it("setter accepts a function updater (toggle pattern)", () => {
    const { result } = renderHook(() => usePersistedBoolean(KEY, true));
    act(() => {
      result.current[1]((v) => !v);
    });
    expect(result.current[0]).toBe(false);
    expect(localStorage.getItem(KEY)).toBe("false");

    act(() => {
      result.current[1]((v) => !v);
    });
    expect(result.current[0]).toBe(true);
    expect(localStorage.getItem(KEY)).toBe("true");
  });

  it("different storage keys are independent", async () => {
    localStorage.setItem("key-a", "true");
    localStorage.setItem("key-b", "false");
    const { result: a } = renderHook(() => usePersistedBoolean("key-a", false));
    const { result: b } = renderHook(() => usePersistedBoolean("key-b", true));
    await act(async () => {});
    expect(a.current[0]).toBe(true);
    expect(b.current[0]).toBe(false);
  });
});
