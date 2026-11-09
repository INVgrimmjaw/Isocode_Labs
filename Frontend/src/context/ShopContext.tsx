import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useState } from 'preact/hooks';
import { ApiError } from '../api/client.ts';
import { getHome } from '../api/retailer.ts';
import type { RetailerHome } from '../api/types.ts';

interface ShopValue {
  home: RetailerHome | null;
  error: ApiError | null;
  refresh: () => Promise<void>;
}

const ShopContext = createContext<ShopValue>(null as unknown as ShopValue);

/** The catalogue, schemes and credit for the signed-in shop. */
export function ShopProvider({ children }: { children: ComponentChildren }) {
  const [home, setHome] = useState<RetailerHome | null>(null);
  const [error, setError] = useState<ApiError | null>(null);

  const refresh = useCallback(async () => {
    try {
      setHome(await getHome());
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err : new ApiError(500, 'UNKNOWN', 'Something went wrong.'));
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return <ShopContext.Provider value={{ home, error, refresh }}>{children}</ShopContext.Provider>;
}

export const useShop = () => useContext(ShopContext);
