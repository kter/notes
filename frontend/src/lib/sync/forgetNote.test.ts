import { describe, it, expect, vi, beforeEach } from "vitest";
import { notesDB } from "@/lib/indexedDB";
import { noteBodyStore } from "./noteBodyStore";
import { forgetNoteLocally } from "./forgetNote";

vi.mock("@/lib/indexedDB", () => ({
  notesDB: {
    deleteNote: vi.fn(),
  },
}));

describe("forgetNoteLocally", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    noteBodyStore.delete("note-1");
  });

  it("removes the note from IndexedDB", async () => {
    await forgetNoteLocally("note-1");

    expect(notesDB.deleteNote).toHaveBeenCalledWith("note-1");
  });

  it("purges the body from the store", async () => {
    noteBodyStore.set("note-1", "body");

    await forgetNoteLocally("note-1");

    expect(noteBodyStore.has("note-1")).toBe(false);
  });

  it("purges a stored empty body as well", async () => {
    noteBodyStore.set("note-1", "");
    expect(noteBodyStore.has("note-1")).toBe(true);

    await forgetNoteLocally("note-1");

    expect(noteBodyStore.has("note-1")).toBe(false);
  });

  it("does not purge the body when the IndexedDB delete rejects", async () => {
    noteBodyStore.set("note-1", "body");
    vi.mocked(notesDB.deleteNote).mockRejectedValueOnce(new Error("db down"));

    await expect(forgetNoteLocally("note-1")).rejects.toThrow("db down");

    expect(noteBodyStore.has("note-1")).toBe(true);
  });
});
