import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import type { CatalogueSku, OrderDetail, RetailerHome } from '#shared/api';
import { formatPercent, formatRupees, formatRupeesExact } from '#shared/money';
import type { PricedLine, Quote } from '#shared/pricing';
import { AlertIcon, BackIcon, GiftIcon } from '../components/icons.tsx';
import { PackShot } from '../components/PackShot.tsx';
import { EmptyState, ErrorState, Loading } from '../components/states.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { showToast } from '../components/toast.tsx';
import { api, ApiError, errorMessage } from '../lib/api.ts';
import { useOnline } from '../lib/hooks.ts';
import { caseCount, useT } from '../lib/i18n.ts';
import { cartItems, clearCart, orderAttemptKey, setLine, skuMap, usePricedCart } from './cart.ts';
import { casePrice, schemeLabel, skuName } from './CatalogueScreen.tsx';
import { home, refreshHome } from './home.ts';

function CartLine({ line, sku }: { line: PricedLine; sku: CatalogueSku }) {
  const t = useT();
  const name = skuName(sku);
  const availableCases = Math.floor(line.availablePieces / sku.unitsPerCase);

  return (
    <li class="line">
      <div class="line-art">
        <PackShot kind={sku.packKind} brand={sku.brand} imageUrl={sku.imageUrl} alt="" />
      </div>
      <div class="line-main">
        <div class="line-top">
          <h3 class="line-name">{name}</h3>
          {line.stock === 'OK' && <p class="line-amount">{formatRupees(line.grossPaise)}</p>}
        </div>
        <p class="price-note">
          {formatRupees(casePrice(sku))}/{t('cat.perCase')} ·{' '}
          {t('cat.plusGst', { rate: formatPercent(sku.gstBps) })}
        </p>

        {line.stock === 'OUT' ? (
          <div class="line-issue">
            <span class="tag tag-muted">{t('cat.out')}</span>
            <button type="button" class="link" onClick={() => setLine(sku.id, 0, 0)}>
              {t('remove')}
            </button>
          </div>
        ) : (
          <>
            <div class="line-controls">
              <Stepper
                value={line.cases}
                label={name}
                onChange={(next) => setLine(sku.id, next, line.pieces)}
              />
              {line.pieces > 0 && <span class="muted">{t('cart.loose', { count: line.pieces })}</span>}
            </div>

            {line.stock === 'SHORT' && (
              <div class="line-issue">
                <span class="tag tag-warn">{t('cart.short', { count: availableCases })}</span>
                <button
                  type="button"
                  class="link"
                  onClick={() =>
                    setLine(sku.id, availableCases, line.availablePieces % sku.unitsPerCase)
                  }
                >
                  {t('cart.useAvailable', { count: availableCases })}
                </button>
              </div>
            )}

            {line.freeCases > 0 && (
              <p class="line-gain">
                <GiftIcon size={16} />
                {t('cart.free', { cases: caseCount(line.freeCases) })}
              </p>
            )}
            {line.freeCasesShort > 0 && (
              <p class="line-note">{t('cart.freeShort', { cases: caseCount(line.freeCasesShort) })}</p>
            )}
            {line.discountPaise > 0 && line.applied && (
              <p class="line-gain">
                {t('cart.discount', {
                  label: schemeLabel(line.applied),
                  amount: formatRupees(line.discountPaise),
                })}
              </p>
            )}
            {line.nudge && (
              <button
                type="button"
                class="nudge"
                onClick={() => setLine(sku.id, line.cases + line.nudge!.casesToAdd, line.pieces)}
              >
                <span>
                  {line.nudge.kind === 'FREE_GOODS'
                    ? t('cart.nudgeFree', { count: line.nudge.casesToAdd, free: caseCount(line.nudge.freeCases) })
                    : t('cart.nudgeSlab', {
                        count: line.nudge.casesToAdd,
                        rate: formatPercent(line.nudge.discountBps),
                      })}
                </span>
                <strong>{t('cart.addMore', { count: line.nudge.casesToAdd })}</strong>
              </button>
            )}
          </>
        )}
      </div>
    </li>
  );
}

function Totals({ quote }: { quote: Quote }) {
  const t = useT();
  return (
    <dl class="totals">
      <div>
        <dt>{t('cart.goods')}</dt>
        <dd>{formatRupeesExact(quote.grossPaise)}</dd>
      </div>
      {quote.discountPaise > 0 && (
        <div class="totals-gain">
          <dt>{t('cart.schemeDiscount')}</dt>
          <dd>−{formatRupeesExact(quote.discountPaise)}</dd>
        </div>
      )}
      {quote.discountPaise > 0 && (
        <div>
          <dt>{t('cart.taxable')}</dt>
          <dd>{formatRupeesExact(quote.taxablePaise)}</dd>
        </div>
      )}
      <div>
        <dt>{t('cart.gst')}</dt>
        <dd>{formatRupeesExact(quote.gstPaise)}</dd>
      </div>
      {quote.freeCases > 0 && (
        <div class="totals-gain">
          <dt>{t('cart.freeGoods')}</dt>
          <dd>{caseCount(quote.freeCases)}</dd>
        </div>
      )}
      <div class="totals-final">
        <dt>{t('cart.total')}</dt>
        <dd>{formatRupeesExact(quote.totalPaise)}</dd>
      </div>
    </dl>
  );
}

function creditOverage(data: RetailerHome, totalPaise: number): number {
  const { limitPaise, outstandingPaise, openOrdersPaise } = data.credit;
  return Math.max(0, outstandingPaise + openOrdersPaise + totalPaise - limitPaise);
}

export function CartScreen() {
  const t = useT();
  const [, navigate] = useLocation();
  const { data, error } = home.use();
  const { lines, quote } = usePricedCart(data);
  const online = useOnline();
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);

  if (!data) {
    return error ? <ErrorState message={error.message} onRetry={() => void refreshHome()} /> : <Loading />;
  }

  const skus = skuMap(data.skus);
  const hasLines = quote && quote.lines.length > 0;
  const overage = quote ? creditOverage(data, quote.totalPaise) : 0;

  async function place() {
    if (!quote) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      const order = await api<OrderDetail>('/api/retailer/orders', {
        body: {
          items: cartItems(lines),
          idempotencyKey: orderAttemptKey(),
          expectedTotalPaise: quote.totalPaise,
        },
        timeoutMs: 30_000,
      });
      clearCart();
      void refreshHome();
      navigate(`/orders/${order.id}?placed=1`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await refreshHome();
        showToast(t('cart.changed'));
      } else {
        setPlaceError(err instanceof ApiError && err.isNetwork ? t('cart.failed') : errorMessage(err));
      }
      setPlacing(false);
    }
  }

  const buttonLabel = placing
    ? t('cart.placing')
    : !online
      ? t('cart.offline')
      : quote?.blocked
        ? t('cart.fixFirst')
        : t('cart.place');

  return (
    <>
      <header class="bar">
        <Link href="/" class="icon-btn" aria-label={t('back')}>
          <BackIcon />
        </Link>
        <h1 class="bar-title">{t('cart.title')}</h1>
      </header>

      {!hasLines ? (
        <main class="page">
          <EmptyState title={t('cart.emptyTitle')} hint={t('cart.emptyHint')}>
            <Link href="/" class="btn btn-primary">
              {t('cart.browse')}
            </Link>
          </EmptyState>
        </main>
      ) : (
        <>
          <main class="page page-with-footer">
            <ul class="lines">
              {quote.lines.map((line) => {
                const sku = skus.get(line.skuId);
                return sku ? <CartLine key={line.skuId} line={line} sku={sku} /> : null;
              })}
            </ul>

            <Totals quote={quote} />

            {overage > 0 ? (
              <p class="notice notice-warn">
                <AlertIcon size={18} />
                {t('cart.creditOver', { amount: formatRupees(overage) })}
              </p>
            ) : (
              <p class="muted credit-line">
                {t('cart.creditOk', { amount: formatRupees(data.credit.availablePaise) })}
              </p>
            )}

            {placeError && (
              <p class="notice notice-danger" role="alert">
                {placeError}
              </p>
            )}
          </main>

          <footer class="footer">
            <div class="footer-total">
              <span class="muted">{t('cart.total')}</span>
              <strong>{formatRupees(quote.totalPaise)}</strong>
            </div>
            <button
              type="button"
              class="btn btn-primary"
              disabled={placing || !online || quote.blocked}
              onClick={() => void place()}
            >
              {buttonLabel}
            </button>
          </footer>
        </>
      )}
    </>
  );
}
