import type { ComponentType } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { ErrorState, Loading } from '../components/states.tsx';
import { translate } from './i18n.ts';

/** Splits a screen out of the first download. Far smaller than pulling in preact/compat for lazy(). */
export function lazyScreen<P extends object>(load: () => Promise<ComponentType<P>>): ComponentType<P> {
  let loaded: ComponentType<P> | null = null;

  return function LazyScreen(props: P) {
    const [Screen, setScreen] = useState<ComponentType<P> | null>(() => loaded);
    const [failed, setFailed] = useState(false);
    useEffect(() => {
      if (loaded) return;
      load()
        .then((component) => {
          loaded = component;
          setScreen(() => component);
        })
        .catch(() => setFailed(true));
    }, []);
    // A dropped connection, or a new release replacing the files this page was built with.
    if (failed) return <ErrorState message={translate('error.network')} onRetry={() => location.reload()} />;
    return Screen ? <Screen {...props} /> : <Loading />;
  };
}
