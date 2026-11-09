import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { ApiError } from './api.ts';
import { translate } from './i18n.ts';

export interface AsyncState<T> {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
  reload: () => void;
  setData: (data: T) => void;
}

/** Loads on mount and when deps change. A slower earlier request can never overwrite a newer one. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[]): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(true);
  const latest = useRef(0);

  const run = useCallback(() => {
    const id = ++latest.current;
    setLoading(true);
    setError(null);
    load()
      .then((result) => {
        if (id !== latest.current) return;
        setData(result);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (id !== latest.current) return;
        setError(err instanceof ApiError ? err : new ApiError(500, 'UNKNOWN', translate('error.generic')));
        setLoading(false);
      });
  }, deps);

  useEffect(run, [run]);

  return { data, error, loading, reload: run, setData };
}

export function useOnline(): boolean {
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const update = () => setOnline(navigator.onLine);
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);
  return online;
}
