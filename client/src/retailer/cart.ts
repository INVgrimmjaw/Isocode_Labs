import { useMemo } from 'preact/hooks';
import type { CatalogueSku, RetailerHome } from '#shared/api';
import { priceCart, type CartItem, type Quote } from '#shared/pricing';
import { SHOP_DATA_PREFIX } from '../lib/session.ts';
import { createStore, storage } from '../lib/store.ts';

type CartLines = Record<string, { cases: number; pieces: number }>;

export const cart = createStore<CartLines>({});

let storageKey: string | null = null;
/** Kept across retries of the same cart, so a timed-out request cannot become a second order. */
let idempotencyKey: string | null = null;

function randomKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function save(next: CartLines) {
  idempotencyKey = null;
  if (storageKey) storage.write(storageKey, next);
  cart.set(next);
}

/** A cart survives the app being closed between customers. */
export function loadCart(retailerId: string) {
  storageKey = `${SHOP_DATA_PREFIX}cart.${retailerId}`;
  cart.set(storage.read<CartLines>(storageKey) ?? {});
}

export function setLine(skuId: string, cases: number, pieces: number) {
  const next = { ...cart.get() };
  if (cases <= 0 && pieces <= 0) delete next[skuId];
  else next[skuId] = { cases: Math.max(0, cases), pieces: Math.max(0, pieces) };
  save(next);
}

export function replaceCart(lines: CartLines) {
  save(lines);
}

export function clearCart() {
  save({});
}

/** Removes items the distributor no longer sells, so a cart saved last week cannot break. */
export function pruneCart(validSkuIds: ReadonlySet<string>) {
  const lines = cart.get();
  const kept = Object.entries(lines).filter(([skuId]) => validSkuIds.has(skuId));
  if (kept.length !== Object.keys(lines).length) save(Object.fromEntries(kept));
}

export function orderAttemptKey(): string {
  idempotencyKey ??= randomKey();
  return idempotencyKey;
}

export function cartItems(lines: CartLines): CartItem[] {
  return Object.entries(lines).map(([skuId, line]) => ({ skuId, ...line }));
}

export function skuMap(skus: CatalogueSku[]): Map<string, CatalogueSku> {
  return new Map(skus.map((sku) => [sku.id, sku]));
}

/** Prices the cart in the browser, so a stepper tap never waits for the network. */
export function usePricedCart(home: RetailerHome | null): { lines: CartLines; quote: Quote | null } {
  const lines = cart.use();
  const quote = useMemo(() => {
    if (!home) return null;
    const skus = skuMap(home.skus);
    const known = cartItems(lines).filter((item) => skus.has(item.skuId));
    return priceCart(known, skus, home.schemes, new Date());
  }, [home, lines]);
  return { lines, quote };
}

export const lineCount = (lines: CartLines) => Object.keys(lines).length;
