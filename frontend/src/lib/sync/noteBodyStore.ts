import { useSyncExternalStore } from "react";

type Listener = () => void;

const bodies = new Map<string, string>();
const listeners = new Set<Listener>();

function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notify(): void {
  listeners.forEach((l) => l());
}

export const noteBodyStore = {
  get(id: string): string {
    return bodies.get(id) ?? "";
  },

  set(id: string, content: string): void {
    if (bodies.get(id) !== content) {
      bodies.set(id, content);
      notify();
    }
  },

  delete(id: string): void {
    if (bodies.has(id)) {
      bodies.delete(id);
      notify();
    }
  },

  subscribe,
};

export function useNoteBody(id: string | null | undefined): string {
  return useSyncExternalStore(
    subscribe,
    () => (id ? bodies.get(id) ?? "" : ""),
    () => (id ? bodies.get(id) ?? "" : "")
  );
}
