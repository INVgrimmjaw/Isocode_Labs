import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { useT } from '../context/LanguageContext.tsx';
import { ErrorState, Loading } from './states.tsx';

/** Splits a page out of the first download. Far smaller than pulling in preact/compat for lazy(). */
export function lazyPage<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  let loaded: ComponentType<P> | null = null;

  return function LazyPage(props: P) {
    const t = useT();
    const [Page, setPage] = useState<ComponentType<P> | null>(() => loaded);
    const [failed, setFailed] = useState(false);

    useEffect(() => {
      if (loaded) return;
      load()
        .then((component) => {
          loaded = component;
          setPage(() => component);
        })
        .catch(() => setFailed(true));
    }, []);

    // A dropped connection, or a new release replacing the files this page was built with.
    if (failed) return <ErrorState message={t('error.network')} retryLabel={t('retry')} onRetry={() => location.reload()} />;
    return Page ? <Page {...props} /> : <Loading />;
  };
}
