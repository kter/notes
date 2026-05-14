/**
 * cursorRange ユーティリティ関数のユニットテスト。
 * isCursorInRange と isCursorOnLine の境界値を網羅的に検証する。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection } from "@codemirror/state";
import { isCursorInRange, isCursorOnLine } from "../cursorRange";

function makeState(doc: string, cursorPos: number): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [],
  });
}

function makeStateWithRange(
  doc: string,
  anchor: number,
  head: number
): EditorState {
  return EditorState.create({
    doc,
    selection: EditorSelection.range(anchor, head),
    extensions: [],
  });
}

// ----------------------------------------------------------------
// isCursorInRange
// ----------------------------------------------------------------
describe("isCursorInRange", () => {
  it("returns false when cursor is entirely before the range", () => {
    // doc: "hello world", range = [6, 11] ("world"), cursor at 2
    const state = makeState("hello world", 2);
    expect(isCursorInRange(state, 6, 11)).toBe(false);
  });

  it("returns false when cursor is entirely after the range", () => {
    // range = [0, 5] ("hello"), cursor at 9
    const state = makeState("hello world", 9);
    expect(isCursorInRange(state, 0, 5)).toBe(false);
  });

  it("returns true when cursor is inside the range", () => {
    // range = [0, 11], cursor at 5
    const state = makeState("hello world", 5);
    expect(isCursorInRange(state, 0, 11)).toBe(true);
  });

  it("returns true when selection overlaps the start of the range", () => {
    // selection [2, 8], range [6, 11] — overlaps at [6, 8]
    const state = makeStateWithRange("hello world", 2, 8);
    expect(isCursorInRange(state, 6, 11)).toBe(true);
  });

  it("returns true when selection overlaps the end of the range", () => {
    // selection [8, 11], range [6, 11] — overlaps at [8, 11]
    const state = makeStateWithRange("hello world", 8, 11);
    expect(isCursorInRange(state, 6, 11)).toBe(true);
  });

  it("returns true when cursor is exactly at range.from (touching)", () => {
    // cursor at 6, range [6, 11] — from < to (6 < 11) and to > from (6 > 6 is false for cursor)
    // cursor is a collapsed range: from === to === 6
    // overlap check: range.from(6) < to(11) && range.to(6) > from(6) → 6 > 6 is false
    // So a cursor at the very boundary (from side) does NOT overlap
    const state = makeState("hello world", 6);
    expect(isCursorInRange(state, 6, 11)).toBe(false);
  });

  it("returns false when cursor is exactly at range.to (touching from outside)", () => {
    // cursor at 11, range [6, 11]
    // range.from(11) < to(11) → false
    const state = makeState("hello world", 11);
    expect(isCursorInRange(state, 6, 11)).toBe(false);
  });

  it("returns true when cursor is strictly inside the range boundaries", () => {
    const state = makeState("hello world", 8);
    expect(isCursorInRange(state, 6, 11)).toBe(true);
  });
});

// ----------------------------------------------------------------
// isCursorOnLine
// ----------------------------------------------------------------
describe("isCursorOnLine", () => {
  const doc = "line one\nline two\nline three";
  // line 1: [0, 8]  "line one"
  // line 2: [9, 17] "line two"
  // line 3: [18, 27] "line three"

  it("returns true when cursor is on the same line as pos", () => {
    // cursor at 3 (line 1), pos at 5 (line 1)
    const state = makeState(doc, 3);
    expect(isCursorOnLine(state, 5)).toBe(true);
  });

  it("returns false when cursor is on a different line", () => {
    // cursor at 3 (line 1), pos at 12 (line 2)
    const state = makeState(doc, 3);
    expect(isCursorOnLine(state, 12)).toBe(false);
  });

  it("returns true when cursor and pos are both on line 2", () => {
    // cursor at 10 (line 2), pos at 14 (line 2)
    const state = makeState(doc, 10);
    expect(isCursorOnLine(state, 14)).toBe(true);
  });

  it("returns false when cursor is on line 3 and pos is on line 1", () => {
    const state = makeState(doc, 22);
    expect(isCursorOnLine(state, 2)).toBe(false);
  });

  it("returns true when cursor is at the very start of the line containing pos", () => {
    // cursor at 9 (start of line 2), pos at 9 (line 2)
    const state = makeState(doc, 9);
    expect(isCursorOnLine(state, 9)).toBe(true);
  });
});
