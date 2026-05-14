/**
 * buildTaskDecorations のユニットテスト。
 * TaskMarker ノードに対してチェックボックスウィジェットデコレーションが
 * 正しく生成されることを検証する。
 * DOM / change イベントのテストは行わない。
 */
import { describe, expect, it } from "vitest";
import { EditorState, EditorSelection, type Range } from "@codemirror/state";
import { Decoration, EditorView } from "@codemirror/view";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { ensureSyntaxTree } from "@codemirror/language";
import { GFM } from "@lezer/markdown";
import { buildTaskDecorations, TaskCheckboxWidget } from "../taskList";

function makeFakeView(state: EditorState): EditorView {
  return {
    visibleRanges: [{ from: 0, to: state.doc.length }],
    state,
    composing: false,
  } as unknown as EditorView;
}

/** GFM タスクリストをパースするための EditorState を作成する */
function makeState(doc: string, cursorPos = 0): EditorState {
  const state = EditorState.create({
    doc,
    selection: EditorSelection.cursor(cursorPos),
    extensions: [markdown({ base: markdownLanguage, extensions: [GFM] })],
  });
  // lezer-markdown は遅延パースするため、テストでは強制的にフルパースしておく
  ensureSyntaxTree(state, state.doc.length, 100);
  return state;
}

/** widget を持つ replace デコレーションを取得する */
function getWidgetDecs(decs: Range<Decoration>[]): Range<Decoration>[] {
  return decs.filter(
    (d) => (d.value.spec as { widget?: unknown }).widget !== undefined
  );
}

/** デコレーションの widget を TaskCheckboxWidget として取得する */
function getWidget(dec: Range<Decoration>): TaskCheckboxWidget {
  return (dec.value.spec as { widget: TaskCheckboxWidget }).widget;
}

// ---------------------------------------------------------------
// TaskMarker detection
// ---------------------------------------------------------------
describe("buildTaskDecorations — task list", () => {
  const doc = "- [ ] unchecked\n- [x] checked";
  // line 1: "- [ ] unchecked"  TaskMarker at [2, 5]  ([ ])
  // line 2: "- [x] checked"   TaskMarker at [18, 21] ([x])

  it("emits two TaskCheckboxWidget replace decorations", () => {
    const state = makeState(doc, doc.length);
    const decs = buildTaskDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    expect(widgets.length).toBe(2);
  });

  it("first widget has checked=false (unchecked marker)", () => {
    const state = makeState(doc, doc.length);
    const decs = buildTaskDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs).sort((a, b) => a.from - b.from);
    const first = getWidget(widgets[0]);
    expect(first).toBeInstanceOf(TaskCheckboxWidget);
    // Use eq to compare against a known unchecked widget
    const unchecked = new TaskCheckboxWidget(false, widgets[0].from);
    const wrongChecked = new TaskCheckboxWidget(true, widgets[0].from);
    expect(first.eq(unchecked)).toBe(true);
    expect(first.eq(wrongChecked)).toBe(false);
  });

  it("second widget has checked=true (checked marker)", () => {
    const state = makeState(doc, doc.length);
    const decs = buildTaskDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs).sort((a, b) => a.from - b.from);
    const second = getWidget(widgets[1]);
    expect(second).toBeInstanceOf(TaskCheckboxWidget);
    const checked = new TaskCheckboxWidget(true, widgets[1].from);
    const wrongUnchecked = new TaskCheckboxWidget(false, widgets[1].from);
    expect(second.eq(checked)).toBe(true);
    expect(second.eq(wrongUnchecked)).toBe(false);
  });

  it("decorations cover the TaskMarker ranges", () => {
    const state = makeState(doc, doc.length);
    const decs = buildTaskDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs).sort((a, b) => a.from - b.from);
    // "- [ ] unchecked": TaskMarker is "[ ]" at index 2-5
    expect(widgets[0].from).toBe(2);
    expect(widgets[0].to).toBe(5);
    // "- [x] checked": TaskMarker is "[x]" at index 18-21
    expect(widgets[1].from).toBe(18);
    expect(widgets[1].to).toBe(21);
  });
});

// ---------------------------------------------------------------
// [X] uppercase
// ---------------------------------------------------------------
describe("buildTaskDecorations — uppercase [X]", () => {
  it("treats [X] as checked", () => {
    const doc = "- [X] uppercase checked";
    const state = makeState(doc, doc.length);
    const decs = buildTaskDecorations(state, makeFakeView(state));
    const widgets = getWidgetDecs(decs);
    expect(widgets.length).toBe(1);
    const widget = getWidget(widgets[0]);
    const checkedRef = new TaskCheckboxWidget(true, widgets[0].from);
    expect(widget.eq(checkedRef)).toBe(true);
  });
});

// ---------------------------------------------------------------
// No task decorations for plain bullet list
// ---------------------------------------------------------------
describe("buildTaskDecorations — plain bullet list", () => {
  it("emits no task decorations for plain bullet list without checkbox", () => {
    const doc = "- plain item\n- another item";
    const state = makeState(doc, 0);
    const decs = buildTaskDecorations(state, makeFakeView(state));
    expect(decs.length).toBe(0);
  });
});

// ---------------------------------------------------------------
// eq method
// ---------------------------------------------------------------
describe("TaskCheckboxWidget.eq", () => {
  it("returns true for equal widgets", () => {
    const w1 = new TaskCheckboxWidget(true, 5);
    const w2 = new TaskCheckboxWidget(true, 5);
    expect(w1.eq(w2)).toBe(true);
  });

  it("returns false when checked differs", () => {
    const w1 = new TaskCheckboxWidget(true, 5);
    const w2 = new TaskCheckboxWidget(false, 5);
    expect(w1.eq(w2)).toBe(false);
  });

  it("returns false when markerFrom differs", () => {
    const w1 = new TaskCheckboxWidget(true, 5);
    const w2 = new TaskCheckboxWidget(true, 10);
    expect(w1.eq(w2)).toBe(false);
  });
});
