import { api } from './client.ts';
import type { SessionUser } from './types.ts';

export const requestOtp = (phone: string) =>
  api<{ demoCode?: string }>('/api/auth/otp/request', { body: { phone } });

export const verifyOtp = (phone: string, code: string) =>
  api<void>('/api/auth/otp/verify', { body: { phone, code } });

export const getMe = () => api<SessionUser>('/api/auth/me');

export const logout = () => api<void>('/api/auth/logout', { method: 'POST' });
