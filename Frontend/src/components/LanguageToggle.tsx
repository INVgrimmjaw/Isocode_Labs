import { useLanguage } from '../context/LanguageContext.tsx';

export function LanguageToggle() {
  const { locale, setLocale } = useLanguage();
  return (
    <div class="lang" role="group" aria-label="Language">
      <button type="button" aria-pressed={locale === 'en'} onClick={() => setLocale('en')}>
        EN
      </button>
      <button type="button" lang="hi" aria-pressed={locale === 'hi'} onClick={() => setLocale('hi')}>
        हिं
      </button>
    </div>
  );
}
