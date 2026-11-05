import { useSyncExternalStore } from 'react';

export function useStore<T>(store: { subscribe(l: () => void): () => void }, read: () => T): T {
  return useSyncExternalStore((l) => store.subscribe(l), read, read);
}
