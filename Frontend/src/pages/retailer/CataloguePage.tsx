import { useMemo, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { getOrder } from '../../api/retailer.ts';
import type { CatalogueSku, RetailerHome, Scheme } from '../../api/types.ts';
import { formatPercent, formatRupees, shortName } from '../../components/format.ts';
import { ChevronIcon, RepeatIcon, SearchIcon } from '../../components/icons.tsx';
import { LanguageToggle } from '../../components/LanguageToggle.tsx';
import { PackShot } from '../../components/PackShot.tsx';
import { EmptyState, ErrorState } from '../../components/states.tsx';
import { Stepper } from '../../components/Stepper.tsx';
import { showToast } from '../../components/toast.tsx';
import { useCart, type CartLines } from '../../context/CartContext.tsx';
import { errorText, itemCount, useLanguage, useT } from '../../context/LanguageContext.tsx';
import { useShop } from '../../context/ShopContext.tsx';

const LOW_STOCK_CASES = 10;

// Kept between visits, so opening the cart and coming back does not lose the shopkeeper's place.
let lastQuery = '';

const fullCases = (sku: CatalogueSku) => Math.floor(sku.stockPieces / sku.unitsPerCase);

export function useSkuName() {
  const { locale } = useLanguage();
  return (sku: CatalogueSku) => (locale === 'hi' ? sku.nameHi : shortName(sku.name));
}

function matches(sku: CatalogueSku, terms: string[]): boolean {
  const text = `${sku.name} ${sku.nameHi} ${sku.brand} ${sku.code} ${sku.keywords.join(' ')}`.toLowerCase();
  return terms.every((term) => text.includes(term));
}

function StockTag({ sku }: { sku: CatalogueSku }) {
  const t = useT();
  if (sku.stockPieces === 0) return <span class="tag tag-muted art-tag">{t('cat.out')}</span>;
  const cases = fullCases(sku);
  if (cases > LOW_STOCK_CASES) return null;
  return <span class="tag tag-warn art-tag">{t('cat.low', { count: cases })}</span>;
}

function ProductCard({
  sku,
  scheme,
  line,
}: {
  sku: CatalogueSku;
  scheme?: Scheme;
  line?: { cases: number; pieces: number };
}) {
  const t = useT();
  const { locale } = useLanguage();
  const { setLine } = useCart();
  const name = useSkuName()(sku);
  const out = sku.stockPieces === 0;
  const maxCases = fullCases(sku);

  return (
    <article class={`card${out ? ' card-out' : ''}`}>
      <div class="card-art">
        <PackShot kind={sku.packKind} brand={sku.brand} />
        <StockTag sku={sku} />
      </div>
      <div class="card-body">
        <h3 class="card-name">{name}</h3>
        <p class="price">
          <strong>{formatRupees(sku.unitPricePaise * sku.unitsPerCase)}</strong>
          <span class="price-unit">/{t('cat.perCase')}</span>
        </p>
        <p class="price-note">{t('cat.plusGst', { rate: formatPercent(sku.gstBps) })}</p>
        <p class="price-note">
          {t('cat.perPiece', { price: formatRupees(sku.unitPricePaise), units: sku.unitsPerCase })}
        </p>
        {scheme && <p class="scheme">{locale === 'hi' ? scheme.labelHi : scheme.label}</p>}
      </div>
      <div class="card-action">
        {out || maxCases === 0 ? (
          <button type="button" class="btn btn-block" disabled>
            {t('cat.out')}
          </button>
        ) : line ? (
          <Stepper
            value={line.cases}
            max={maxCases}
            label={name}
            onChange={(next) => setLine(sku.id, next, line.pieces)}
          />
        ) : (
          <button type="button" class="btn btn-add btn-block" onClick={() => setLine(sku.id, 1, 0)}>
            {t('cat.add')}
          </button>
        )}
      </div>
    </article>
  );
}

/** Rebuilds the order at today's prices and stock, and reports what could not be included. */
function RepeatLastOrder({ home }: { home: RetailerHome }) {
  const t = useT();
  const [, navigate] = useLocation();
  const { replace } = useCart();
  const [busy, setBusy] = useState(false);
  const last = home.lastOrder;
  if (!last) return null;

  async function repeat() {
    setBusy(true);
    try {
      const order = await getOrder(last!.id);
      const skus = new Map(home.skus.map((s) => [s.id, s]));
      const lines: CartLines = {};
      const skipped: string[] = [];

      for (const line of order.lines) {
        const sku = skus.get(line.skuId);
        if (!sku || sku.stockPieces === 0) {
          skipped.push(shortName(line.skuName));
          continue;
        }
        const wanted = Math.min(sku.stockPieces, line.cases * line.unitsPerCase + line.pieces);
        lines[line.skuId] = {
          cases: Math.floor(wanted / line.unitsPerCase),
          pieces: wanted % line.unitsPerCase,
        };
      }
      replace(lines);
      if (skipped.length > 0) showToast(t('cart.skipped', { names: skipped.join(', ') }));
      navigate('/cart');
    } catch (err) {
      showToast(errorText(err, t));
      setBusy(false);
    }
  }

  return (
    <button type="button" class="repeat" disabled={busy} onClick={() => void repeat()}>
      <RepeatIcon />
      <span class="repeat-text">
        <strong>{t('cat.repeat')}</strong>
        <span class="muted">
          {t('cat.repeatDetail', { items: itemCount(last.lineCount, t), total: formatRupees(last.totalPaise) })}
        </span>
      </span>
      <ChevronIcon size={18} />
    </button>
  );
}

function CartBar({ home }: { home: RetailerHome }) {
  const t = useT();
  const { items } = useCart();
  if (items.length === 0) return null;

  // Before schemes and tax, which the cart works out with the server.
  const skus = new Map(home.skus.map((s) => [s.id, s]));
  const goods = items.reduce((sum, item) => {
    const sku = skus.get(item.skuId);
    return sku ? sum + (item.cases * sku.unitsPerCase + item.pieces) * sku.unitPricePaise : sum;
  }, 0);

  return (
    <Link href="/cart" class="cart-bar">
      <span>
        <strong>{itemCount(items.length, t)}</strong>
        <span class="cart-bar-total">{t('bar.goods', { amount: formatRupees(goods) })}</span>
      </span>
      <span class="cart-bar-go">
        {t('bar.view')}
        <ChevronIcon size={18} />
      </span>
    </Link>
  );
}

function SkeletonGrid() {
  return (
    <div class="grid" aria-hidden="true">
      {Array.from({ length: 6 }, (_, i) => (
        <div key={i} class="card card-skeleton">
          <div class="skeleton skeleton-art" />
          <div class="skeleton skeleton-line" />
          <div class="skeleton skeleton-line skeleton-short" />
        </div>
      ))}
    </div>
  );
}

export function CataloguePage({ shopName }: { shopName: string }) {
  const t = useT();
  const { home, error, refresh } = useShop();
  const { lines } = useCart();
  const [query, setQuery] = useState(lastQuery);

  const schemeBySku = useMemo(() => new Map(home?.schemes.map((s) => [s.skuId, s])), [home]);

  const visible = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    return (home?.skus ?? []).filter((sku) => matches(sku, terms));
  }, [home, query]);

  return (
    <>
      <div class="shop-head-row">
        <div>
          <p class="shop-name">{shopName}</p>
          {home && (
            <p class="shop-credit">
              {t('cat.credit')} <strong>{formatRupees(home.credit.availablePaise)}</strong>
            </p>
          )}
        </div>
        <LanguageToggle />
      </div>

      {/* Only search stays pinned, leaving more of a small phone for products. */}
      <header class="shop-head">
        <label class="search">
          <SearchIcon size={20} />
          <input
            type="search"
            placeholder={t('cat.search')}
            aria-label={t('cat.search')}
            value={query}
            onInput={(e) => {
              lastQuery = e.currentTarget.value;
              setQuery(e.currentTarget.value);
            }}
          />
        </label>
      </header>

      <main class="page">
        {!home && error && (
          <ErrorState message={errorText(error, t)} retryLabel={t('retry')} onRetry={() => void refresh()} />
        )}
        {!home && !error && <SkeletonGrid />}

        {home && (
          <>
            {!query && <RepeatLastOrder home={home} />}
            {visible.length === 0 ? (
              <EmptyState title={t('cat.emptyTitle', { query })} hint={t('cat.emptyHint')} />
            ) : (
              <div class="grid">
                {visible.map((sku) => (
                  <ProductCard key={sku.id} sku={sku} scheme={schemeBySku.get(sku.id)} line={lines[sku.id]} />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      {home && <CartBar home={home} />}
    </>
  );
}
