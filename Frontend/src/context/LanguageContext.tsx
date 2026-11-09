import { createContext, type ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { ApiError } from '../api/client.ts';
import { en, hi, type StringKey } from './strings.ts';

export type Locale = 'en' | 'hi';
export type Translate = (key: StringKey, vars?: Record<string, string | number>) => string;

const STORAGE_KEY = 'peti.locale';

interface LanguageValue {
  locale: Locale;
  dateLocale: string;
  setLocale: (next: Locale) => void;
  t: Translate;
}

const LanguageContext = createContext<LanguageValue>(null as unknown as LanguageValue);

function savedLocale(): Locale {
  try {
    return localStorage.getItem(STORAGE_KEY) === 'hi' ? 'hi' : 'en';
  } catch {
    return 'en';
  }
}

export function LanguageProvider({ children }: { children: ComponentChildren }) {
  const [locale, setLocaleState] = useState<Locale>(savedLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next: Locale) => {
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The choice simply lasts for this visit.
    }
    setLocaleState(next);
  }, []);

  const t = useCallback<Translate>(
    (key, vars) => {
      const template = (locale === 'hi' ? hi : en)[key];
      if (!vars) return template;
      return template.replace(/\{(\w+)\}/g, (_, name: string) => String(vars[name] ?? ''));
    },
    [locale],
  );

  const value = useMemo(
    () => ({ locale, setLocale, t, dateLocale: locale === 'hi' ? 'hi-IN' : 'en-IN' }),
    [locale, setLocale, t],
  );

  return <LanguageContext.Provider value={value}>{children}</LanguageContext.Provider>;
}

export const useLanguage = () => useContext(LanguageContext);
export const useT = () => useLanguage().t;

const LOCALISED_ERRORS: Partial<Record<string, StringKey>> = {
  NETWORK: 'error.network',
  INVALID_CODE: 'error.invalidCode',
  RATE_LIMITED: 'error.tooMany',
};

/** Puts an API error into the shopkeeper's language where it is one they can meet. */
export function errorText(error: unknown, t: Translate): string {
  if (!(error instanceof ApiError)) return t('error.generic');
  const key = LOCALISED_ERRORS[error.code];
  return key ? t(key) : error.message;
}

export function itemCount(count: number, t: Translate): string {
  return count === 1 ? t('bar.item') : t('bar.items', { count });
}

export function caseCount(count: number, t: Translate): string {
  return count === 1 ? t('cart.oneCase') : t('cart.casesCount', { count });
}
