import { useEffect, useState } from 'preact/hooks';
import type { DemoAccount, OtpRequestResponse } from '#shared/api';
import { LanguageToggle } from '../components/LanguageToggle.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { maskedPhone } from '../lib/format.ts';
import { useT } from '../lib/i18n.ts';
import { completeSignIn } from '../lib/session.ts';

export function LoginScreen() {
  const t = useT();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [demoAccounts, setDemoAccounts] = useState<DemoAccount[]>([]);

  useEffect(() => {
    api<{ accounts: DemoAccount[] }>('/api/auth/demo-accounts')
      .then((res) => setDemoAccounts(res.accounts))
      .catch(() => {});
  }, []);

  async function requestCode(number: string) {
    setBusy(true);
    setError(null);
    try {
      const res = await api<OtpRequestResponse>('/api/auth/otp/request', { body: { phone: number } });
      setPhone(number);
      setDemoCode(res.demoCode ?? null);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/otp/verify', { body: { phone, code } });
      await completeSignIn();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <div class="login">
      <header class="login-head">
        <span class="wordmark">Peti</span>
        <LanguageToggle />
      </header>

      <main class="login-main">
        <h1 class="login-title">{t('login.tagline')}</h1>

        {step === 'phone' ? (
          <form
            class="login-form"
            onSubmit={(e) => {
              e.preventDefault();
              if (/^[6-9]\d{9}$/.test(phone)) void requestCode(phone);
              else setError(t('error.invalidPhone'));
            }}
          >
            <label class="field">
              <span class="field-label">{t('login.phone')}</span>
              <span class="phone-input">
                <span class="phone-prefix">+91</span>
                <input
                  class="input"
                  type="tel"
                  inputMode="numeric"
                  autoComplete="tel-national"
                  maxLength={10}
                  value={phone}
                  onInput={(e) => setPhone(e.currentTarget.value.replace(/\D/g, ''))}
                  required
                />
              </span>
            </label>
            {error && <p class="form-error">{error}</p>}
            <button class="btn btn-primary btn-block" disabled={busy || phone.length !== 10}>
              {t('login.send')}
            </button>
          </form>
        ) : (
          <form class="login-form" onSubmit={verify}>
            <p class="login-sent">{t('login.sentTo', { phone: maskedPhone(phone) })}</p>
            {demoCode && (
              <button type="button" class="demo-sms" onClick={() => setCode(demoCode)}>
                {t('login.demoSms')} <strong>{demoCode}</strong>
              </button>
            )}
            <label class="field">
              <span class="field-label">{t('login.code')}</span>
              <input
                class="input input-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onInput={(e) => setCode(e.currentTarget.value.replace(/\D/g, ''))}
                required
              />
            </label>
            {error && <p class="form-error">{error}</p>}
            <button class="btn btn-primary btn-block" disabled={busy || code.length !== 6}>
              {t('login.verify')}
            </button>
            <div class="login-links">
              <button
                type="button"
                class="link"
                onClick={() => {
                  setStep('phone');
                  setError(null);
                }}
              >
                {t('login.change')}
              </button>
              <button type="button" class="link" disabled={busy} onClick={() => void requestCode(phone)}>
                {t('login.resend')}
              </button>
            </div>
          </form>
        )}

        {step === 'phone' && demoAccounts.length > 0 && (
          <section class="demo">
            <h2 class="demo-title">{t('login.demoAccounts')}</h2>
            <ul class="demo-list">
              {demoAccounts.map((account) => (
                <li key={account.phone}>
                  <button
                    type="button"
                    class="demo-account"
                    disabled={busy}
                    onClick={() => void requestCode(account.phone)}
                  >
                    <span>{account.role === 'DESK' ? t('login.desk') : account.label}</span>
                    <span class="demo-phone">{account.phone}</span>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </main>
    </div>
  );
}
