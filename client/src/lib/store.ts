import { useEffect, useState } from 'preact/hooks';

/** A value that components can subscribe to. Enough state management for an app this size. */
export function createStore<T>(initial: T) {
  let value = initial;
  const listeners = new Set<() => void>();

  return {
    get: () => value,
    set(next: T) {
      value = next;
      listeners.forEach((listener) => listener());
    },
    use(): T {
      const [, setTick] = useState(0);
      useEffect(() => {
        const listener = () => setTick((tick) => tick + 1);
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      }, []);
      return value;
    },
  };
}

/** Storage can be full or disabled in a private window, and the app must carry on regardless. */
export const storage = {
  read<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // The app still works without persistence.
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(key);
    } catch {
      // Nothing to clean up.
    }
  },
  /** Removes every key with this prefix. */
  clear(prefix: string) {
    try {
      Object.keys(localStorage)
        .filter((key) => key.startsWith(prefix))
        .forEach((key) => localStorage.removeItem(key));
    } catch {
      // Nothing to clean up.
    }
  },
};
