import { Link } from 'wouter-preact';
import { listOrders } from '../../api/retailer.ts';
import type { OrderStatus } from '../../api/types.ts';
import { formatDateTime, formatRupees } from '../../components/format.ts';
import { ChevronIcon } from '../../components/icons.tsx';
import { EmptyState, ErrorState, Loading } from '../../components/states.tsx';
import { useAsync } from '../../components/useAsync.ts';
import { errorText, itemCount, useLanguage, useT } from '../../context/LanguageContext.tsx';
import type { StringKey } from '../../context/strings.ts';

const STATUS_TONE: Record<OrderStatus, string> = {
  CREDIT_HOLD: 'tag-warn',
  READY: 'tag-accent',
  EXPORTED: 'tag-muted',
  REJECTED: 'tag-danger',
};

export function StatusTag({ status }: { status: OrderStatus }) {
  const t = useT();
  return <span class={`tag ${STATUS_TONE[status]}`}>{t(`status.${status}` as StringKey)}</span>;
}

export function OrdersPage() {
  const t = useT();
  const { dateLocale } = useLanguage();
  const { data, error, loading, reload } = useAsync(listOrders, []);

  return (
    <>
      <header class="bar">
        <h1 class="bar-title bar-title-lead">{t('orders.title')}</h1>
      </header>
      <main class="page">
        {loading && !data && <Loading />}
        {error && !data && <ErrorState message={errorText(error, t)} retryLabel={t('retry')} onRetry={reload} />}
        {data && data.length === 0 && (
          <EmptyState title={t('orders.emptyTitle')} hint={t('orders.emptyHint')}>
            <Link href="/" class="btn btn-primary">
              {t('cart.browse')}
            </Link>
          </EmptyState>
        )}
        {data && data.length > 0 && (
          <ul class="rows">
            {data.map((order) => (
              <li key={order.id}>
                <Link href={`/orders/${order.id}`} class="row">
                  <span class="row-main">
                    <strong>{formatRupees(order.totalPaise)}</strong>
                    <span class="muted">
                      {formatDateTime(order.createdAt, dateLocale)} · {itemCount(order.lineCount, t)}
                    </span>
                  </span>
                  <StatusTag status={order.status} />
                  <ChevronIcon size={18} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
