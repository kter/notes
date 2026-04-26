import { useSyncExternalStore } from "react";

type Listener = () => void;

const bodies = new Map<string, string>();
const listeners = new Set<Listener>();
let storeVersion = 0;

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

  has(id: string): boolean {
    return bodies.has(id);
  },

  set(id: string, content: string): void {
    if (bodies.get(id) !== content) {
      bodies.set(id, content);
      storeVersion++;
      notify();
    }
  },

  delete(id: string): void {
    if (bodies.has(id)) {
      bodies.delete(id);
      storeVersion++;
      notify();
    }
  },

  version(): number {
    return storeVersion;
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
