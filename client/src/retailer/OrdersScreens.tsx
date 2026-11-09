import { useState } from 'preact/hooks';
import { Link, useLocation, useSearch } from 'wouter-preact';
import type { OrderDetail, OrderStatus, OrderSummary } from '#shared/api';
import { formatRupees, formatRupeesExact } from '#shared/money';
import { BackIcon, CheckIcon, ChevronIcon, GiftIcon } from '../components/icons.tsx';
import { EmptyState, ErrorState, Loading } from '../components/states.tsx';
import { showToast } from '../components/toast.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { formatDateTime, shortName } from '../lib/format.ts';
import { useAsync } from '../lib/hooks.ts';
import { caseCount, itemCount, useT, type StringKey } from '../lib/i18n.ts';
import { repeatOrder } from './home.ts';

const STATUS_TONE: Record<OrderStatus, string> = {
  CREDIT_HOLD: 'tag-warn',
  READY: 'tag-accent',
  EXPORTED: 'tag-muted',
  REJECTED: 'tag-danger',
};

function StatusTag({ status }: { status: OrderStatus }) {
  const t = useT();
  return <span class={`tag ${STATUS_TONE[status]}`}>{t(`status.${status}` as StringKey)}</span>;
}

export function OrdersScreen() {
  const t = useT();
  const { data, error, loading, reload } = useAsync(
    () => api<OrderSummary[]>('/api/retailer/orders'),
    [],
  );

  return (
    <>
      <header class="bar">
        <h1 class="bar-title bar-title-lead">{t('orders.title')}</h1>
      </header>
      <main class="page">
        {loading && !data && <Loading />}
        {error && !data && <ErrorState message={error.message} onRetry={reload} />}
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
                      {formatDateTime(order.createdAt)} · {itemCount(order.lineCount)}
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

function quantityText(cases: number, pieces: number, t: ReturnType<typeof useT>): string {
  return [
    cases > 0 ? `${cases} ${t('cat.perCase')}` : '',
    pieces > 0 ? `${pieces} ${t('review.piece')}` : '',
  ]
    .filter(Boolean)
    .join(' + ');
}

export function OrderDetailScreen({ id }: { id: string }) {
  const t = useT();
  const [, navigate] = useLocation();
  const search = useSearch();
  const [repeating, setRepeating] = useState(false);
  const { data: order, error, loading, reload } = useAsync(
    () => api<OrderDetail>(`/api/retailer/orders/${id}`),
    [id],
  );

  async function again() {
    setRepeating(true);
    try {
      const { skipped } = await repeatOrder(id);
      showToast(
        skipped.length > 0 ? t('orders.repeatedSkipped', { names: skipped.join(', ') }) : t('orders.repeated'),
      );
      navigate('/cart');
    } catch (err) {
      showToast(errorMessage(err));
      setRepeating(false);
    }
  }

  return (
    <>
      <header class="bar">
        <Link href="/orders" class="icon-btn" aria-label={t('back')}>
          <BackIcon />
        </Link>
        <h1 class="bar-title">{order?.label ?? ''}</h1>
      </header>
      <main class="page">
        {loading && !order && <Loading />}
        {error && !order && <ErrorState message={error.message} onRetry={reload} />}
        {order && (
          <>
            {search.includes('placed=1') && (
              <p class="notice notice-success">
                <CheckIcon size={18} />
                {t('orders.placedOk')}
              </p>
            )}
            <section class="status-card">
              <StatusTag status={order.status} />
              <p>
                {t(`status.detail.${order.status}` as StringKey, {
                  amount: formatRupees(order.overLimitPaise ?? 0),
                })}
              </p>
              {order.rejectedReason && <p class="muted">{order.rejectedReason}</p>}
              <p class="muted">
                {formatDateTime(order.createdAt)}
                {order.source === 'AI_CAPTURE' ? ` · ${t('orders.fromMessage')}` : ''}
              </p>
            </section>

            <ul class="lines lines-plain">
              {order.lines.map((line) => (
                <li key={line.skuId} class="line line-plain">
                  <div class="line-main">
                    <div class="line-top">
                      <h3 class="line-name">{shortName(line.skuName)}</h3>
                      <p class="line-amount">{formatRupees(line.taxablePaise)}</p>
                    </div>
                    <p class="price-note">{quantityText(line.cases, line.pieces, t)}</p>
                    {line.freeCases > 0 && (
                      <p class="line-gain">
                        <GiftIcon size={16} />
                        {t('cart.free', { cases: caseCount(line.freeCases) })}
                      </p>
                    )}
                  </div>
                </li>
              ))}
            </ul>

            <dl class="totals">
              <div>
                <dt>{t('cart.taxable')}</dt>
                <dd>{formatRupeesExact(order.taxablePaise)}</dd>
              </div>
              <div>
                <dt>{t('cart.gst')}</dt>
                <dd>{formatRupeesExact(order.gstPaise)}</dd>
              </div>
              <div class="totals-final">
                <dt>{t('orders.total')}</dt>
                <dd>{formatRupeesExact(order.totalPaise)}</dd>
              </div>
            </dl>

            <button
              type="button"
              class="btn btn-quiet btn-block"
              disabled={repeating}
              onClick={() => void again()}
            >
              {t('orders.again')}
            </button>
          </>
        )}
      </main>
    </>
  );
}
