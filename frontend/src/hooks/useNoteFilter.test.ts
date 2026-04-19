import { renderHook } from "@testing-library/react";
import { describe, it, expect, afterEach } from "vitest";
import { useNoteFilter } from "./useNoteFilter";
import { noteBodyStore } from "@/lib/sync/noteBodyStore";
import type { Note } from "@/types";

const makeNote = (overrides: Partial<Note>): Note => ({
  id: "1",
  title: "Untitled",
  content: "",
  folder_id: null,
  created_at: "",
  updated_at: "",
  user_id: "user1",
  deleted_at: null,
  version: 1,
  ...overrides,
});

const notes: Note[] = [
  makeNote({ id: "1", title: "Alpha", content: "hello world", folder_id: "folderA" }),
  makeNote({ id: "2", title: "Beta", content: "foo bar", folder_id: "folderA" }),
  makeNote({ id: "3", title: "Gamma", content: "baz qux", folder_id: "folderB" }),
  makeNote({ id: "4", title: "Delta", content: "hello again", folder_id: null }),
];

describe("useNoteFilter", () => {
  afterEach(() => {
    notes.forEach((n) => noteBodyStore.delete(n.id));
  });

  it("returns all notes when no folder and no query", () => {
    const { result } = renderHook(() => useNoteFilter(notes, null, ""));
    expect(result.current).toHaveLength(4);
  });

  it("filters by folder", () => {
    const { result } = renderHook(() => useNoteFilter(notes, "folderA", ""));
    expect(result.current.map((n) => n.id)).toEqual(["1", "2"]);
  });

  it("filters by search query in title", () => {
    const { result } = renderHook(() => useNoteFilter(notes, null, "Alpha"));
    expect(result.current.map((n) => n.id)).toEqual(["1"]);
  });

  it("filters by search query in content", () => {
    const { result } = renderHook(() => useNoteFilter(notes, null, "hello"));
    expect(result.current.map((n) => n.id)).toEqual(["1", "4"]);
  });

  it("search is case-insensitive", () => {
    const { result } = renderHook(() => useNoteFilter(notes, null, "HELLO"));
    expect(result.current.map((n) => n.id)).toEqual(["1", "4"]);
  });

  it("combines folder and search filters", () => {
    const { result } = renderHook(() => useNoteFilter(notes, "folderA", "hello"));
    expect(result.current.map((n) => n.id)).toEqual(["1"]);
  });

  it("does not touch content when query is empty", () => {
    const contentAccessCount = { value: 0 };
    const spyNotes = notes.map((n) => ({
      ...n,
      get content() {
        contentAccessCount.value++;
        return n.content;
      },
    })) as Note[];

    renderHook(() => useNoteFilter(spyNotes, null, ""));
    expect(contentAccessCount.value).toBe(0);
  });

  it("returns empty array when nothing matches", () => {
    const { result } = renderHook(() => useNoteFilter(notes, null, "zzznomatch"));
    expect(result.current).toHaveLength(0);
  });

  it("uses noteBodyStore content for search when available", () => {
    // Note 2 has n.content="foo bar", but noteBodyStore has updated body with "hello store"
    noteBodyStore.set("2", "hello store updated content");
    const { result } = renderHook(() => useNoteFilter(notes, null, "store updated"));
    expect(result.current.map((n) => n.id)).toEqual(["2"]);
  });

  it("falls back to n.content when note not in noteBodyStore", () => {
    // Note 3 is not in noteBodyStore, so n.content="baz qux" is used
    const { result } = renderHook(() => useNoteFilter(notes, null, "baz"));
    expect(result.current.map((n) => n.id)).toEqual(["3"]);
  });

  it("noteBodyStore content takes precedence over stale n.content", () => {
    // Simulate content-only edit: n.content is stale, noteBodyStore has latest
    noteBodyStore.set("1", "completely different text");
    const { result } = renderHook(() => useNoteFilter(notes, null, "completely different"));
    expect(result.current.map((n) => n.id)).toEqual(["1"]);
  });
});
