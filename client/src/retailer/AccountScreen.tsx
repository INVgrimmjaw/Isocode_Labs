import { useEffect, useState } from 'preact/hooks';
import type { SessionUser } from '#shared/api';
import { formatRupees } from '#shared/money';
import { LanguageToggle } from '../components/LanguageToggle.tsx';
import { useT } from '../lib/i18n.ts';
import { signOut } from '../lib/session.ts';
import { home } from './home.ts';

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>;
}

export function AccountScreen({ user }: { user: SessionUser }) {
  const t = useT();
  const { data } = home.use();
  const [installEvent, setInstallEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as InstallPromptEvent);
    };
    window.addEventListener('beforeinstallprompt', capture);
    return () => window.removeEventListener('beforeinstallprompt', capture);
  }, []);

  const credit = data?.credit;

  return (
    <>
      <header class="bar">
        <h1 class="bar-title bar-title-lead">{t('account.title')}</h1>
      </header>
      <main class="page">
        <section class="panel">
          <h2 class="panel-title">{user.retailer?.shopName}</h2>
          <p class="muted">{user.name}</p>
        </section>

        {credit && (
          <section class="panel">
            <dl class="totals totals-flat">
              <div>
                <dt>{t('account.creditLimit')}</dt>
                <dd>{formatRupees(credit.limitPaise)}</dd>
              </div>
              <div>
                <dt>{t('account.outstanding')}</dt>
                <dd>{formatRupees(credit.outstandingPaise)}</dd>
              </div>
              <div>
                <dt>{t('account.openOrders')}</dt>
                <dd>{formatRupees(credit.openOrdersPaise)}</dd>
              </div>
              <div class="totals-final">
                <dt>{t('account.available')}</dt>
                <dd>{formatRupees(credit.availablePaise)}</dd>
              </div>
            </dl>
          </section>
        )}

        <section class="panel panel-row">
          <span>{t('account.language')}</span>
          <LanguageToggle />
        </section>

        {installEvent && (
          <section class="panel">
            <p class="muted">{t('account.installHint')}</p>
            <button
              type="button"
              class="btn btn-quiet btn-block"
              onClick={() => {
                void installEvent.prompt();
                setInstallEvent(null);
              }}
            >
              {t('account.install')}
            </button>
          </section>
        )}

        <button type="button" class="btn btn-quiet btn-block" onClick={() => void signOut()}>
          {t('account.signOut')}
        </button>
      </main>
    </>
  );
}
