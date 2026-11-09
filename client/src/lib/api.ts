import type { ApiErrorBody } from '#shared/api';
import { translate, type StringKey } from './i18n.ts';

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

/** Registered by the session module, which would otherwise be a circular import. */
export function handleSignedOut(callback: () => void) {
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
    throw new ApiError(0, 'NETWORK', translate('error.network'));
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
    error?.message ?? translate('error.generic'),
    error?.details,
  );
}

/** Errors a shopkeeper can meet, in their language. The rest only reach the English-language desk. */
const LOCALISED_ERRORS: Partial<Record<string, StringKey>> = {
  INVALID_CODE: 'error.invalidCode',
  NO_ITEMS: 'error.noItems',
  RATE_LIMITED: 'error.tooMany',
};

export function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return translate('error.generic');
  const key = LOCALISED_ERRORS[error.code];
  return key ? translate(key) : error.message;
}
