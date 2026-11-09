import type { SessionUser } from '../../api/types.ts';
import { formatRupees } from '../../components/format.ts';
import { LanguageToggle } from '../../components/LanguageToggle.tsx';
import { useAuth } from '../../context/AuthContext.tsx';
import { useT } from '../../context/LanguageContext.tsx';
import { useShop } from '../../context/ShopContext.tsx';

export function AccountPage({ user }: { user: SessionUser }) {
  const t = useT();
  const { signOut } = useAuth();
  const { home } = useShop();
  const credit = home?.credit;

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

        <button type="button" class="btn btn-quiet btn-block" onClick={() => void signOut()}>
          {t('account.signOut')}
        </button>
      </main>
    </>
  );
}
