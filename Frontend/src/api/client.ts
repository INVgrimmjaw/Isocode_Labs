import type { ApiErrorBody } from './types.ts';

const DEFAULT_TIMEOUT_MS = 20_000;

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
  }

  get isNetwork() {
    return this.status === 0;
  }
}

let onSignedOut: () => void = () => {};

export function setSignedOutHandler(callback: () => void) {
  onSignedOut = callback;
}

interface Options {
  method?: 'GET' | 'POST';
  body?: unknown;
  timeoutMs?: number;
}

export async function api<T>(path: string, options: Options = {}): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? DEFAULT_TIMEOUT_MS);

  let response: Response;
  try {
    response = await fetch(path, {
      method: options.method ?? (options.body === undefined ? 'GET' : 'POST'),
      headers: options.body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
  } catch {
    throw new ApiError(0, 'NETWORK', "Couldn't reach the server. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (response.status === 204) return undefined as T;

  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload as T;

  if (response.status === 401 && !path.startsWith('/api/auth/otp')) onSignedOut();
  const error = (payload as ApiErrorBody | null)?.error;
  throw new ApiError(
    response.status,
    error?.code ?? 'UNKNOWN',
    error?.message ?? 'Something went wrong. Please try again.',
    error?.details,
  );
}
