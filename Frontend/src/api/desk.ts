import { api } from './client.ts';
import type {
  CaptureDetail,
  CaptureSummary,
  CartItem,
  ConfirmCaptureResult,
  ConfirmLine,
  InactiveRetailer,
  OrderDetail,
  OrderStatus,
  OrderSummary,
  Quote,
  RetailerOption,
  TallyBatchView,
  TallyPreview,
  VanListResponse,
} from './types.ts';

/** Reading a message can wait on the AI model. */
const READ_TIMEOUT_MS = 45_000;

export const listOrders = (status: OrderStatus | '') =>
  api<OrderSummary[]>(`/api/desk/orders${status ? `?status=${status}` : ''}`);

export const getOrder = (id: string) => api<OrderDetail>(`/api/desk/orders/${id}`);

export const releaseHold = (id: string) =>
  api<OrderDetail>(`/api/desk/orders/${id}/release`, { method: 'POST' });

export const rejectOrder = (id: string, reason: string) =>
  api<OrderDetail>(`/api/desk/orders/${id}/reject`, { body: { reason } });

export const listRetailers = () => api<RetailerOption[]>('/api/desk/retailers');

export const listInactiveRetailers = () => api<InactiveRetailer[]>('/api/desk/retailers/inactive');

export const listCaptures = () => api<CaptureSummary[]>('/api/desk/captures');

export const createCapture = (retailerId: string, text: string) =>
  api<CaptureDetail>('/api/desk/captures', { body: { retailerId, text }, timeoutMs: READ_TIMEOUT_MS });

export const getCapture = (id: string) => api<CaptureDetail>(`/api/desk/captures/${id}`);

export const quoteCapture = (id: string, items: CartItem[]) =>
  api<Quote>(`/api/desk/captures/${id}/quote`, { body: { items } });

export const confirmCapture = (id: string, lines: ConfirmLine[], expectedTotalPaise: number) =>
  api<ConfirmCaptureResult>(`/api/desk/captures/${id}/confirm`, {
    body: { lines, expectedTotalPaise },
    timeoutMs: 30_000,
  });

export const rejectCapture = (id: string) => api<void>(`/api/desk/captures/${id}/reject`, { method: 'POST' });

export const getTallyPreview = () => api<TallyPreview>('/api/desk/tally');

export const exportToTally = () => api<TallyBatchView>('/api/desk/tally/batches', { method: 'POST' });

export const tallyFileUrl = (id: string) => `/api/desk/tally/batches/${id}/file`;

export const getVanLists = () => api<VanListResponse>('/api/desk/van-lists');
