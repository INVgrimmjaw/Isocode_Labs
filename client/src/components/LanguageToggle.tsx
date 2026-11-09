import { locale, setLocale } from '../lib/i18n.ts';

export function LanguageToggle() {
  const current = locale.use();
  return (
    <div class="lang" role="group" aria-label="Language">
      <button type="button" aria-pressed={current === 'en'} onClick={() => setLocale('en')}>
        EN
      </button>
      <button type="button" lang="hi" aria-pressed={current === 'hi'} onClick={() => setLocale('hi')}>
        हिं
      </button>
    </div>
  );
}
