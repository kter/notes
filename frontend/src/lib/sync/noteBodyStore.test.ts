import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { noteBodyStore, useNoteBody } from "./noteBodyStore";

afterEach(() => {
  noteBodyStore.delete("a");
  noteBodyStore.delete("b");
});

describe("noteBodyStore", () => {
  describe("bodyForPersist", () => {
    it("returns undefined for a note that was never opened this session", () => {
      // undefined は「本文に触るな」の意味。"" を返すと IndexedDB の本文を
      // 空文字列で上書きしてしまう。
      expect(noteBodyStore.bodyForPersist("never-opened")).toBeUndefined();
    });

    it("distinguishes a deliberately emptied body from an absent one", () => {
      noteBodyStore.set("emptied", "");

      expect(noteBodyStore.bodyForPersist("emptied")).toBe("");
      expect(noteBodyStore.bodyForPersist("absent")).toBeUndefined();
    });

    it("returns the stored body once the note has been edited", () => {
      noteBodyStore.set("a", "edited body");

      expect(noteBodyStore.bodyForPersist("a")).toBe("edited body");
    });
  });

  describe("resolve / set", () => {
    it("returns empty string for unknown id", () => {
      expect(noteBodyStore.resolve("unknown", "")).toBe("");
    });

    it("stores and retrieves a value", () => {
      noteBodyStore.set("a", "hello");
      expect(noteBodyStore.resolve("a", "")).toBe("hello");
    });

    it("overwrites an existing value", () => {
      noteBodyStore.set("a", "first");
      noteBodyStore.set("a", "second");
      expect(noteBodyStore.resolve("a", "")).toBe("second");
    });

    it("does not notify listeners when setting the same value", () => {
      noteBodyStore.set("a", "same");
      const listener = vi.fn();
      const unsub = noteBodyStore.subscribe(listener);
      noteBodyStore.set("a", "same");
      expect(listener).not.toHaveBeenCalled();
      unsub();
    });

    it("notifies listeners when value changes", () => {
      noteBodyStore.set("a", "old");
      const listener = vi.fn();
      const unsub = noteBodyStore.subscribe(listener);
      noteBodyStore.set("a", "new");
      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });
  });

  describe("has", () => {
    it("returns false for unknown id", () => {
      expect(noteBodyStore.has("unknown")).toBe(false);
    });

    it("returns true after set", () => {
      noteBodyStore.set("a", "data");
      expect(noteBodyStore.has("a")).toBe(true);
    });

    it("returns false after delete", () => {
      noteBodyStore.set("a", "data");
      noteBodyStore.delete("a");
      expect(noteBodyStore.has("a")).toBe(false);
    });

    it("returns true even when value is empty string", () => {
      noteBodyStore.set("a", "");
      expect(noteBodyStore.has("a")).toBe(true);
    });
  });

  describe("resolve", () => {
    it("returns the fallback for an unknown id", () => {
      expect(noteBodyStore.resolve("unknown", "fallback")).toBe("fallback");
    });

    it("returns the fallback when id is null or undefined", () => {
      expect(noteBodyStore.resolve(null, "fallback")).toBe("fallback");
      expect(noteBodyStore.resolve(undefined, "fallback")).toBe("fallback");
    });

    it("returns a stored empty string instead of the fallback", () => {
      noteBodyStore.set("a", "");
      expect(noteBodyStore.resolve("a", "fallback")).toBe("");
    });

    it("returns the stored body when present", () => {
      noteBodyStore.set("a", "stored body");
      expect(noteBodyStore.resolve("a", "fallback")).toBe("stored body");
    });
  });

  describe("version", () => {
    it("increments on set with new value", () => {
      const before = noteBodyStore.version();
      noteBodyStore.set("a", "v1");
      expect(noteBodyStore.version()).toBe(before + 1);
    });

    it("does not increment when setting the same value", () => {
      noteBodyStore.set("a", "same");
      const before = noteBodyStore.version();
      noteBodyStore.set("a", "same");
      expect(noteBodyStore.version()).toBe(before);
    });

    it("increments on delete", () => {
      noteBodyStore.set("a", "data");
      const before = noteBodyStore.version();
      noteBodyStore.delete("a");
      expect(noteBodyStore.version()).toBe(before + 1);
    });

    it("does not increment when deleting nonexistent id", () => {
      const before = noteBodyStore.version();
      noteBodyStore.delete("nonexistent");
      expect(noteBodyStore.version()).toBe(before);
    });
  });

  describe("delete", () => {
    it("removes a stored value", () => {
      noteBodyStore.set("a", "data");
      noteBodyStore.delete("a");
      expect(noteBodyStore.resolve("a", "fallback")).toBe("fallback");
    });

    it("is a no-op and does not notify for unknown id", () => {
      const listener = vi.fn();
      const unsub = noteBodyStore.subscribe(listener);
      noteBodyStore.delete("nonexistent");
      expect(listener).not.toHaveBeenCalled();
      unsub();
    });

    it("notifies listeners when deleting an existing value", () => {
      noteBodyStore.set("a", "data");
      const listener = vi.fn();
      const unsub = noteBodyStore.subscribe(listener);
      noteBodyStore.delete("a");
      expect(listener).toHaveBeenCalledTimes(1);
      unsub();
    });
  });

  describe("subscribe", () => {
    it("unsubscribing stops further notifications", () => {
      const listener = vi.fn();
      const unsub = noteBodyStore.subscribe(listener);
      unsub();
      noteBodyStore.set("a", "x");
      expect(listener).not.toHaveBeenCalled();
    });

    it("multiple listeners are all notified", () => {
      const l1 = vi.fn();
      const l2 = vi.fn();
      const u1 = noteBodyStore.subscribe(l1);
      const u2 = noteBodyStore.subscribe(l2);
      noteBodyStore.set("a", "v");
      expect(l1).toHaveBeenCalledTimes(1);
      expect(l2).toHaveBeenCalledTimes(1);
      u1();
      u2();
    });
  });
});

describe("useNoteBody", () => {
  it("returns empty string when id is null", () => {
    const { result } = renderHook(() => useNoteBody(null));
    expect(result.current).toBe("");
  });

  it("returns empty string for unknown id", () => {
    const { result } = renderHook(() => useNoteBody("missing"));
    expect(result.current).toBe("");
  });

  it("returns current value for a known id", () => {
    noteBodyStore.set("b", "initial body");
    const { result } = renderHook(() => useNoteBody("b"));
    expect(result.current).toBe("initial body");
  });

  it("re-renders with updated value when store changes", () => {
    noteBodyStore.set("b", "v1");
    const { result } = renderHook(() => useNoteBody("b"));
    expect(result.current).toBe("v1");

    act(() => {
      noteBodyStore.set("b", "v2");
    });
    expect(result.current).toBe("v2");
  });

  it("returns empty string after value is deleted", () => {
    noteBodyStore.set("b", "present");
    const { result } = renderHook(() => useNoteBody("b"));

    act(() => {
      noteBodyStore.delete("b");
    });
    expect(result.current).toBe("");
  });
});
