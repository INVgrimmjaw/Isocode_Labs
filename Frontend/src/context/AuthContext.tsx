import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useState } from 'preact/hooks';
import { getMe, logout } from '../api/auth.ts';
import { setSignedOutHandler } from '../api/client.ts';
import type { SessionUser } from '../api/types.ts';

const USER_KEY = 'peti.user';
const CART_PREFIX = 'peti.cart.';

interface AuthValue {
  user: SessionUser | null;
  completeSignIn: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthValue>(null as unknown as AuthValue);

function savedUser(): SessionUser | null {
  try {
    const raw = localStorage.getItem(USER_KEY);
    return raw ? (JSON.parse(raw) as SessionUser) : null;
  } catch {
    return null;
  }
}

function store(user: SessionUser | null) {
  try {
    if (user) {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
      return;
    }
    localStorage.removeItem(USER_KEY);
    Object.keys(localStorage)
      .filter((key) => key.startsWith(CART_PREFIX))
      .forEach((key) => localStorage.removeItem(key));
  } catch {
    // The app still works without persistence.
  }
}

/**
 * The cookie is the real session, and the server checks it on every call. The copy in storage
 * only lets the app open straight into the right screen instead of waiting on the network.
 */
export function AuthProvider({ children }: { children: ComponentChildren }) {
  const [user, setUser] = useState<SessionUser | null>(savedUser);

  const remember = useCallback((next: SessionUser | null) => {
    store(next);
    setUser(next);
  }, []);

  useEffect(() => {
    setSignedOutHandler(() => remember(null));
    // A failed network call must not sign anyone out.
    if (savedUser()) getMe().then(remember).catch(() => {});
  }, [remember]);

  const completeSignIn = useCallback(async () => remember(await getMe()), [remember]);

  const signOut = useCallback(async () => {
    await logout().catch(() => {});
    remember(null);
  }, [remember]);

  return <AuthContext.Provider value={{ user, completeSignIn, signOut }}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
export const cartStorageKey = (retailerId: string) => `${CART_PREFIX}${retailerId}`;
