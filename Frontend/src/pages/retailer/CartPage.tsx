import { useEffect, useRef, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { ApiError } from '../../api/client.ts';
import { getQuote, placeOrder } from '../../api/retailer.ts';
import type { CatalogueSku, PricedLine, Quote, RetailerHome } from '../../api/types.ts';
import { formatPercent, formatRupees, formatRupeesExact } from '../../components/format.ts';
import { AlertIcon, BackIcon, GiftIcon } from '../../components/icons.tsx';
import { PackShot } from '../../components/PackShot.tsx';
import { EmptyState, ErrorState, Loading } from '../../components/states.tsx';
import { Stepper } from '../../components/Stepper.tsx';
import { showToast } from '../../components/toast.tsx';
import { useCart } from '../../context/CartContext.tsx';
import { caseCount, errorText, useLanguage, useT } from '../../context/LanguageContext.tsx';
import { useShop } from '../../context/ShopContext.tsx';
import { useSkuName } from './CataloguePage.tsx';

/** Waits for tapping to stop, so five quick taps cost one request on 3G rather than five. */
const QUOTE_DELAY_MS = 300;

function CartLine({
  line,
  sku,
  cases,
  pieces,
}: {
  line: PricedLine;
  sku: CatalogueSku;
  cases: number;
  pieces: number;
}) {
  const t = useT();
  const { locale } = useLanguage();
  const { setLine } = useCart();
  const name = useSkuName()(sku);
  const availableCases = Math.floor(line.availablePieces / sku.unitsPerCase);

  return (
    <li class="line">
      <div class="line-art">
        <PackShot kind={sku.packKind} brand={sku.brand} />
      </div>
      <div class="line-main">
        <div class="line-top">
          <h3 class="line-name">{name}</h3>
          {line.stock === 'OK' && <p class="line-amount">{formatRupees(line.grossPaise)}</p>}
        </div>
        <p class="price-note">
          {formatRupees(sku.unitPricePaise * sku.unitsPerCase)}/{t('cat.perCase')} ·{' '}
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
              <Stepper value={cases} label={name} onChange={(next) => setLine(sku.id, next, pieces)} />
              {pieces > 0 && <span class="muted">{t('cart.loose', { count: pieces })}</span>}
              {cases === 0 && (
                <button type="button" class="link" onClick={() => setLine(sku.id, 0, 0)}>
                  {t('remove')}
                </button>
              )}
            </div>

            {line.stock === 'SHORT' && (
              <div class="line-issue">
                <span class="tag tag-warn">{t('cart.short', { count: availableCases })}</span>
                <button
                  type="button"
                  class="link"
                  onClick={() => setLine(sku.id, availableCases, line.availablePieces % sku.unitsPerCase)}
                >
                  {t('cart.useAvailable', { count: availableCases })}
                </button>
              </div>
            )}

            {line.freeCases > 0 && (
              <p class="line-gain">
                <GiftIcon size={16} />
                {t('cart.free', { cases: caseCount(line.freeCases, t) })}
              </p>
            )}
            {line.freeCasesShort > 0 && (
              <p class="line-note">{t('cart.freeShort', { cases: caseCount(line.freeCasesShort, t) })}</p>
            )}
            {line.discountPaise > 0 && line.applied && (
              <p class="line-gain">
                {t('cart.discount', {
                  label: locale === 'hi' ? line.applied.labelHi : line.applied.label,
                  amount: formatRupees(line.discountPaise),
                })}
              </p>
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
        <>
          <div class="totals-gain">
            <dt>{t('cart.schemeDiscount')}</dt>
            <dd>−{formatRupeesExact(quote.discountPaise)}</dd>
          </div>
          <div>
            <dt>{t('cart.taxable')}</dt>
            <dd>{formatRupeesExact(quote.taxablePaise)}</dd>
          </div>
        </>
      )}
      <div>
        <dt>{t('cart.gst')}</dt>
        <dd>{formatRupeesExact(quote.gstPaise)}</dd>
      </div>
      {quote.freeCases > 0 && (
        <div class="totals-gain">
          <dt>{t('cart.freeGoods')}</dt>
          <dd>{caseCount(quote.freeCases, t)}</dd>
        </div>
      )}
      <div class="totals-final">
        <dt>{t('cart.total')}</dt>
        <dd>{formatRupeesExact(quote.totalPaise)}</dd>
      </div>
    </dl>
  );
}

function creditOverage(home: RetailerHome, totalPaise: number): number {
  const { limitPaise, outstandingPaise, openOrdersPaise } = home.credit;
  return Math.max(0, outstandingPaise + openOrdersPaise + totalPaise - limitPaise);
}

export function CartPage() {
  const t = useT();
  const [, navigate] = useLocation();
  const { home, error: homeError, refresh } = useShop();
  const { lines, items, clear, attemptKey } = useCart();
  const [quote, setQuote] = useState<Quote | null>(null);
  const [quoteError, setQuoteError] = useState<unknown>(null);
  const [pricing, setPricing] = useState(true);
  const [requote, setRequote] = useState(0);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const latest = useRef(0);

  useEffect(() => {
    const id = ++latest.current;
    if (items.length === 0) {
      setQuote(null);
      setPricing(false);
      return;
    }
    setPricing(true);
    setQuoteError(null);
    const timer = setTimeout(() => {
      getQuote(items)
        .then((result) => {
          if (id !== latest.current) return;
          setQuote(result);
          setPricing(false);
        })
        .catch((err: unknown) => {
          if (id !== latest.current) return;
          setQuoteError(err);
          setPricing(false);
        });
    }, QUOTE_DELAY_MS);
    return () => clearTimeout(timer);
    // `items` is rebuilt from `lines`, so `lines` is the real dependency.
  }, [lines, requote]);

  if (!home) {
    return homeError ? (
      <ErrorState message={errorText(homeError, t)} retryLabel={t('retry')} onRetry={() => void refresh()} />
    ) : (
      <Loading />
    );
  }

  const currentHome = home;
  const skus = new Map(home.skus.map((s) => [s.id, s]));
  const overage = quote ? creditOverage(home, quote.totalPaise) : 0;

  async function place() {
    if (!quote) return;
    setPlacing(true);
    setPlaceError(null);
    try {
      const order = await placeOrder({
        items,
        idempotencyKey: attemptKey(),
        expectedTotalPaise: quote.totalPaise,
      });
      clear();
      void refresh();
      navigate(`/orders/${order.id}?placed=1`);
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        await refresh();
        setRequote((n) => n + 1);
        showToast(t('cart.changed'));
      } else {
        setPlaceError(err instanceof ApiError && err.isNetwork ? t('cart.failed') : errorText(err, t));
      }
      setPlacing(false);
    }
  }

  const header = (
    <header class="bar">
      <Link href="/" class="icon-btn" aria-label={t('back')}>
        <BackIcon />
      </Link>
      <h1 class="bar-title">{t('cart.title')}</h1>
    </header>
  );

  if (items.length === 0) {
    return (
      <>
        {header}
        <main class="page">
          <EmptyState title={t('cart.emptyTitle')}>
            <Link href="/" class="btn btn-primary">
              {t('cart.browse')}
            </Link>
          </EmptyState>
        </main>
      </>
    );
  }

  return (
    <>
      {header}
      <main class="page page-with-footer">
        {!quote && pricing && <Loading />}
        {!quote && !pricing && quoteError != null && (
          <ErrorState
            message={errorText(quoteError, t)}
            retryLabel={t('retry')}
            onRetry={() => setRequote((n) => n + 1)}
          />
        )}

        {quote && (
          <>
            <ul class="lines">
              {quote.lines
                .filter((line) => lines[line.skuId])
                .map((line) => {
                  const sku = skus.get(line.skuId);
                  const current = lines[line.skuId]!;
                  return sku ? (
                    <CartLine key={line.skuId} line={line} sku={sku} cases={current.cases} pieces={current.pieces} />
                  ) : null;
                })}
            </ul>

            <div class={pricing ? 'is-updating' : undefined}>
              <Totals quote={quote} />
            </div>

            {overage > 0 ? (
              <p class="notice notice-warn">
                <AlertIcon size={18} />
                {t('cart.creditOver', { amount: formatRupees(overage) })}
              </p>
            ) : (
              <p class="muted credit-line">
                {t('cart.creditOk', { amount: formatRupees(currentHome.credit.availablePaise) })}
              </p>
            )}

            {placeError && (
              <p class="notice notice-danger" role="alert">
                {placeError}
              </p>
            )}
          </>
        )}
      </main>

      {quote && (
        <footer class="footer">
          <div class={`footer-total${pricing ? ' is-updating' : ''}`}>
            <span class="muted">{t('cart.total')}</span>
            <strong>{formatRupees(quote.totalPaise)}</strong>
          </div>
          <button
            type="button"
            class="btn btn-primary"
            disabled={placing || pricing || quote.blocked}
            onClick={() => void place()}
          >
            {placing ? t('cart.placing') : quote.blocked ? t('cart.fixFirst') : t('cart.place')}
          </button>
        </footer>
      )}
    </>
  );
}
