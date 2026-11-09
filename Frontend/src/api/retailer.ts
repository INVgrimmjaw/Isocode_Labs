import { api } from './client.ts';
import type { CartItem, OrderDetail, OrderSummary, Quote, RetailerHome } from './types.ts';

export const getHome = () => api<RetailerHome>('/api/retailer/home');

export const getQuote = (items: CartItem[]) => api<Quote>('/api/retailer/quote', { body: { items } });

export const listOrders = () => api<OrderSummary[]>('/api/retailer/orders');

export const getOrder = (id: string) => api<OrderDetail>(`/api/retailer/orders/${id}`);

export const placeOrder = (body: { items: CartItem[]; idempotencyKey: string; expectedTotalPaise: number }) =>
  api<OrderDetail>('/api/retailer/orders', { body, timeoutMs: 30_000 });
