import { useState } from 'preact/hooks';
import { requestOtp, verifyOtp } from '../api/auth.ts';
import { LanguageToggle } from '../components/LanguageToggle.tsx';
import { useAuth } from '../context/AuthContext.tsx';
import { errorText, useT } from '../context/LanguageContext.tsx';

const INDIAN_MOBILE = /^[6-9]\d{9}$/;

export function LoginPage() {
  const t = useT();
  const { completeSignIn } = useAuth();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [demoCode, setDemoCode] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode() {
    if (!INDIAN_MOBILE.test(phone)) {
      setError(t('error.invalidPhone'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await requestOtp(phone);
      setDemoCode(res.demoCode ?? null);
      setCode('');
      setStep('code');
    } catch (err) {
      setError(errorText(err, t));
    } finally {
      setBusy(false);
    }
  }

  async function verify(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await verifyOtp(phone, code);
      await completeSignIn();
    } catch (err) {
      setError(errorText(err, t));
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
              void sendCode();
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
            <p class="login-sent">{t('login.sentTo', { phone })}</p>
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
              <button type="button" class="link" disabled={busy} onClick={() => void sendCode()}>
                {t('login.resend')}
              </button>
            </div>
          </form>
        )}
      </main>
    </div>
  );
}
