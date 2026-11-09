import type { SessionUser } from '#shared/api';
import { api, handleSignedOut } from './api.ts';
import { createStore, storage } from './store.ts';

const SESSION_KEY = 'peti.session';
/** Per-shop data on this device. It holds private prices and credit, so sign-out must remove it. */
export const SHOP_DATA_PREFIX = 'peti.shop.';

/**
 * The cookie is the real session and the server checks it on every call. This copy only lets
 * the app open straight into the right screen instead of waiting on a network round trip.
 */
export const session = createStore<SessionUser | null>(storage.read<SessionUser>(SESSION_KEY));

function remember(user: SessionUser | null) {
  if (user) storage.write(SESSION_KEY, user);
  else {
    storage.remove(SESSION_KEY);
    storage.clear(SHOP_DATA_PREFIX);
  }
  session.set(user);
}

handleSignedOut(() => remember(null));

export async function completeSignIn() {
  remember(await api<SessionUser>('/api/auth/me'));
}

/** Confirms the remembered session in the background. A failed network call must not sign anyone out. */
export function revalidateSession() {
  if (!session.get()) return;
  api<SessionUser>('/api/auth/me')
    .then(remember)
    .catch(() => {});
}

export async function signOut() {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  remember(null);
}
