import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { CartItem } from '../api/types.ts';
import { cartStorageKey } from './AuthContext.tsx';

export type CartLines = Record<string, { cases: number; pieces: number }>;

interface CartValue {
  lines: CartLines;
  items: CartItem[];
  setLine: (skuId: string, cases: number, pieces: number) => void;
  replace: (lines: CartLines) => void;
  clear: () => void;
  /** Kept across retries of the same cart, so a timed-out request cannot become a second order. */
  attemptKey: () => string;
}

const CartContext = createContext<CartValue>(null as unknown as CartValue);

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function savedCart(key: string): CartLines {
  try {
    return JSON.parse(localStorage.getItem(key) ?? '{}') as CartLines;
  } catch {
    return {};
  }
}

export function CartProvider({ retailerId, children }: { retailerId: string; children: ComponentChildren }) {
  const storageKey = cartStorageKey(retailerId);
  // A cart survives the app being closed between customers.
  const [lines, setLines] = useState<CartLines>(() => savedCart(storageKey));
  const key = useRef<string | null>(null);

  useEffect(() => {
    key.current = null;
    try {
      localStorage.setItem(storageKey, JSON.stringify(lines));
    } catch {
      // The cart still works for this visit.
    }
  }, [lines, storageKey]);

  const setLine = useCallback((skuId: string, cases: number, pieces: number) => {
    setLines((current) => {
      const next = { ...current };
      if (cases <= 0 && pieces <= 0) delete next[skuId];
      else next[skuId] = { cases: Math.max(0, cases), pieces: Math.max(0, pieces) };
      return next;
    });
  }, []);

  const clear = useCallback(() => setLines({}), []);

  const attemptKey = useCallback(() => (key.current ??= randomKey()), []);

  const value = useMemo(
    () => ({
      lines,
      items: Object.entries(lines).map(([skuId, line]) => ({ skuId, ...line })),
      setLine,
      replace: setLines,
      clear,
      attemptKey,
    }),
    [lines, setLine, clear, attemptKey],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export const useCart = () => useContext(CartContext);
