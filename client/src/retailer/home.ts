import type { OrderDetail, RetailerHome } from '#shared/api';
import { api, ApiError } from '../lib/api.ts';
import { translate } from '../lib/i18n.ts';
import { SHOP_DATA_PREFIX } from '../lib/session.ts';
import { createStore, storage } from '../lib/store.ts';
import { pruneCart, replaceCart, skuMap } from './cart.ts';

interface HomeState {
  data: RetailerHome | null;
  error: ApiError | null;
  /** True while showing a saved copy and the fresh one has not arrived. */
  stale: boolean;
}

export const home = createStore<HomeState>({ data: null, error: null, stale: false });

let snapshotKey: string | null = null;

/** Paints from the last saved catalogue at once, then replaces it when the network answers. */
export async function refreshHome(retailerId?: string) {
  if (retailerId) {
    snapshotKey = `${SHOP_DATA_PREFIX}home.${retailerId}`;
    const saved = storage.read<RetailerHome>(snapshotKey);
    if (saved) home.set({ data: saved, error: null, stale: true });
  }
  try {
    const data = await api<RetailerHome>('/api/retailer/home');
    if (snapshotKey) storage.write(snapshotKey, data);
    home.set({ data, error: null, stale: false });
    pruneCart(new Set(data.skus.map((s) => s.id)));
  } catch (err) {
    const error = err instanceof ApiError ? err : new ApiError(500, 'UNKNOWN', translate('error.generic'));
    home.set({ ...home.get(), error, stale: home.get().data !== null });
  }
}

/** Rebuilds an order at today's prices and stock, and reports what could not be included. */
export async function repeatOrder(orderId: string): Promise<{ skipped: string[] }> {
  const order = await api<OrderDetail>(`/api/retailer/orders/${orderId}`);
  const data = home.get().data;
  const skus = skuMap(data?.skus ?? []);
  const lines: Record<string, { cases: number; pieces: number }> = {};
  const skipped: string[] = [];

  for (const line of order.lines) {
    const sku = skus.get(line.skuId);
    if (!sku || sku.stockPieces === 0) {
      skipped.push(line.skuName.split(',')[0] ?? line.skuName);
      continue;
    }
    const wanted = Math.min(sku.stockPieces, line.cases * line.unitsPerCase + line.pieces);
    lines[line.skuId] = {
      cases: Math.floor(wanted / line.unitsPerCase),
      pieces: wanted % line.unitsPerCase,
    };
  }
  replaceCart(lines);
  return { skipped };
}
