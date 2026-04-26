"use client";

import { EditorState } from "@codemirror/state";
import { EditorView, keymap, drawSelection, placeholder as cmPlaceholder } from "@codemirror/view";
import { history, defaultKeymap, historyKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";
import { defaultHighlightStyle, syntaxHighlighting } from "@codemirror/language";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { markdownIndentKeymap } from "./extensions/markdownIndent";
import { markdownListContinuationKeymap } from "./extensions/markdownListContinuation";
import { indentGuide } from "./extensions/indentGuide";

export interface MarkdownEditorHandle {
  getValue: () => string;
  setValue: (value: string) => void;
  focus: () => void;
  view: () => EditorView | null;
}

interface MarkdownEditorProps {
  initialValue: string;
  onChange?: (value: string) => void;
  onBlur?: () => void;
  onSelectionChange?: (selectedText: string) => void;
  onPasteImage?: (file: File) => void;
  className?: string;
  placeholder?: string;
  "data-testid"?: string;
}

export const MarkdownEditor = forwardRef<MarkdownEditorHandle, MarkdownEditorProps>(
  function MarkdownEditor(
    {
      initialValue,
      onChange,
      onBlur,
      onSelectionChange,
      onPasteImage,
      className,
      placeholder: placeholderText,
      "data-testid": testId,
    },
    ref
  ) {
    const containerRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<EditorView | null>(null);

    // Stable callback refs — extensions read from these so they never need to be recreated
    const onChangeRef = useRef(onChange);
    const onBlurRef = useRef(onBlur);
    const onSelectionChangeRef = useRef(onSelectionChange);
    const onPasteImageRef = useRef(onPasteImage);
    onChangeRef.current = onChange;
    onBlurRef.current = onBlur;
    onSelectionChangeRef.current = onSelectionChange;
    onPasteImageRef.current = onPasteImage;

    useEffect(() => {
      if (!containerRef.current) return;

      const extensions = [
        history(),
        keymap.of([
          ...markdownIndentKeymap,
          ...markdownListContinuationKeymap,
          ...defaultKeymap,
          ...historyKeymap,
        ]),
        markdown(),
        syntaxHighlighting(defaultHighlightStyle, { fallback: true }),
        drawSelection(),
        EditorView.lineWrapping,
        indentGuide,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            onChangeRef.current?.(update.state.doc.toString());
          }
          if (update.selectionSet && onSelectionChangeRef.current) {
            const { from, to } = update.state.selection.main;
            onSelectionChangeRef.current(
              from === to ? "" : update.state.sliceDoc(from, to)
            );
          }
        }),
        EditorView.theme({
          "&": { height: "100%" },
          ".cm-scroller": {
            fontFamily:
              "var(--font-mono, ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace)",
            fontSize: "1rem",
            lineHeight: "1.625",
          },
          ".cm-content": { padding: "0", minHeight: "400px" },
          "&.cm-focused": { outline: "none" },
          ".cm-line": { padding: "0" },
          // Remove CM6 default selection color so Tailwind / OS selection is visible
          ".cm-selectionBackground": { background: "Highlight" },
          "&.cm-focused .cm-selectionBackground": { background: "Highlight" },
          ".cm-cursor, .cm-dropCursor": {
            borderLeftColor: "var(--foreground)",
          },
          "&.cm-focused .cm-cursor": {
            borderLeftColor: "var(--foreground)",
          },
        }),
        EditorView.contentAttributes.of({
          spellcheck: "false",
          autocorrect: "off",
          autocapitalize: "off",
          "aria-label": "Note content",
          ...(testId ? { "data-testid": testId } : {}),
        }),
        EditorView.domEventHandlers({
          blur: () => {
            onBlurRef.current?.();
            return false;
          },
          paste: (event) => {
            const file = event.clipboardData?.files[0];
            if (file?.type.startsWith("image/")) {
              event.preventDefault();
              onPasteImageRef.current?.(file);
              return true;
            }
            return false;
          },
        }),
      ];

      if (placeholderText) {
        extensions.push(cmPlaceholder(placeholderText));
      }

      const state = EditorState.create({ doc: initialValue, extensions });
      const view = new EditorView({ state, parent: containerRef.current });
      viewRef.current = view;

      return () => {
        view.destroy();
        viewRef.current = null;
      };
      // Only runs on mount/unmount — parent uses key={note.id} to force remount on note switch
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useImperativeHandle(ref, () => ({
      getValue: () => viewRef.current?.state.doc.toString() ?? "",
      setValue: (value: string) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
      },
      focus: () => viewRef.current?.focus(),
      view: () => viewRef.current,
    }));

    return <div ref={containerRef} className={className} />;
  }
);
