import { Link, useSearch } from 'wouter-preact';
import { getOrder } from '../../api/retailer.ts';
import { formatDateTime, formatRupees, formatRupeesExact, shortName } from '../../components/format.ts';
import { BackIcon, CheckIcon, GiftIcon } from '../../components/icons.tsx';
import { ErrorState, Loading } from '../../components/states.tsx';
import { useAsync } from '../../components/useAsync.ts';
import { caseCount, errorText, useLanguage, useT } from '../../context/LanguageContext.tsx';
import type { StringKey } from '../../context/strings.ts';
import { StatusTag } from './OrdersPage.tsx';

export function OrderDetailPage({ id }: { id: string }) {
  const t = useT();
  const { dateLocale } = useLanguage();
  const search = useSearch();
  const { data: order, error, loading, reload } = useAsync(() => getOrder(id), [id]);

  const quantity = (cases: number, pieces: number) =>
    [cases > 0 ? `${cases} ${t('cat.perCase')}` : '', pieces > 0 ? t('cart.loose', { count: pieces }) : '']
      .filter(Boolean)
      .join(' + ');

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
        {error && !order && <ErrorState message={errorText(error, t)} retryLabel={t('retry')} onRetry={reload} />}
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
                {formatDateTime(order.createdAt, dateLocale)}
                {order.source === 'AI_CAPTURE' ? ` · ${t('orders.fromMessage')}` : ''}
              </p>
            </section>

            <ul class="lines">
              {order.lines.map((line) => (
                <li key={line.skuId} class="line line-plain">
                  <div class="line-main">
                    <div class="line-top">
                      <h3 class="line-name">{shortName(line.skuName)}</h3>
                      <p class="line-amount">{formatRupees(line.taxablePaise)}</p>
                    </div>
                    <p class="price-note">{quantity(line.cases, line.pieces)}</p>
                    {line.freeCases > 0 && (
                      <p class="line-gain">
                        <GiftIcon size={16} />
                        {t('cart.free', { cases: caseCount(line.freeCases, t) })}
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
          </>
        )}
      </main>
    </>
  );
}
