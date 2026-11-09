import { useMemo, useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import type { CatalogueSku, LastOrder } from '#shared/api';
import { formatPercent, formatRupees } from '#shared/money';
import type { Scheme } from '#shared/pricing';
import { RepeatIcon, SearchIcon, ChevronIcon } from '../components/icons.tsx';
import { LanguageToggle } from '../components/LanguageToggle.tsx';
import { PackShot } from '../components/PackShot.tsx';
import { Sheet } from '../components/Sheet.tsx';
import { EmptyState, ErrorState } from '../components/states.tsx';
import { Stepper } from '../components/Stepper.tsx';
import { showToast } from '../components/toast.tsx';
import { errorMessage } from '../lib/api.ts';
import { formatTime, shortName } from '../lib/format.ts';
import { useOnline } from '../lib/hooks.ts';
import { categoryName, itemCount, locale, useT } from '../lib/i18n.ts';
import { cart, lineCount, setLine, usePricedCart } from './cart.ts';
import { home, refreshHome, repeatOrder } from './home.ts';

const LOW_STOCK_CASES = 10;

// Kept between visits, so opening the cart and coming back does not lose the shopkeeper's place.
const browsing = { query: '', category: '' };

const fullCases = (sku: CatalogueSku) => Math.floor(sku.stockPieces / sku.unitsPerCase);
export const casePrice = (sku: CatalogueSku) => sku.unitPricePaise * sku.unitsPerCase;

export function skuName(sku: CatalogueSku): string {
  return locale.get() === 'hi' ? sku.nameHi : shortName(sku.name);
}

export function schemeLabel(scheme: Pick<Scheme, 'label' | 'labelHi'>): string {
  return locale.get() === 'hi' ? scheme.labelHi : scheme.label;
}

function matches(sku: CatalogueSku, terms: string[]): boolean {
  const text = `${sku.name} ${sku.nameHi} ${sku.brand} ${sku.category} ${sku.code} ${sku.keywords.join(' ')}`.toLowerCase();
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
  onOpen,
}: {
  sku: CatalogueSku;
  scheme?: Scheme;
  line?: { cases: number; pieces: number };
  onOpen: () => void;
}) {
  const t = useT();
  const out = sku.stockPieces === 0;
  const name = skuName(sku);
  const maxCases = fullCases(sku);

  return (
    <article class={`card${out ? ' card-out' : ''}`}>
      <button type="button" class="card-art" onClick={onOpen} aria-label={name}>
        <PackShot kind={sku.packKind} brand={sku.brand} imageUrl={sku.imageUrl} alt="" />
        <StockTag sku={sku} />
      </button>
      <div class="card-body">
        <h3 class="card-name">{name}</h3>
        <p class="price">
          <strong>{formatRupees(casePrice(sku))}</strong>
          <span class="price-unit">/{t('cat.perCase')}</span>
        </p>
        <p class="price-note">{t('cat.plusGst', { rate: formatPercent(sku.gstBps) })}</p>
        <p class="price-note">
          {t('cat.perPiece', { price: formatRupees(sku.unitPricePaise), units: sku.unitsPerCase })}
        </p>
        {scheme && <p class="scheme">{schemeLabel(scheme)}</p>}
      </div>
      <div class="card-action">
        {out ? (
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
          <button
            type="button"
            class="btn btn-add btn-block"
            onClick={() => (maxCases > 0 ? setLine(sku.id, 1, 0) : onOpen())}
          >
            {t('cat.add')}
          </button>
        )}
      </div>
    </article>
  );
}

function ProductSheet({
  sku,
  scheme,
  onClose,
}: {
  sku: CatalogueSku;
  scheme?: Scheme;
  onClose: () => void;
}) {
  const t = useT();
  const lines = cart.use();
  const line = lines[sku.id] ?? { cases: 0, pieces: 0 };
  const out = sku.stockPieces === 0;

  return (
    <Sheet title={skuName(sku)} onClose={onClose}>
      <div class="sheet-art">
        <PackShot kind={sku.packKind} brand={sku.brand} imageUrl={sku.imageUrl} alt="" />
      </div>
      <dl class="facts">
        <div>
          <dt>{t('cat.casePrice')}</dt>
          <dd>
            {formatRupees(casePrice(sku))} <span class="muted">{t('cat.plusGst', { rate: formatPercent(sku.gstBps) })}</span>
          </dd>
        </div>
        <div>
          <dt>{t('review.piece')}</dt>
          <dd>{t('cat.perPiece', { price: formatRupees(sku.unitPricePaise), units: sku.unitsPerCase })}</dd>
        </div>
        <div>
          <dt>{t('cat.brand')}</dt>
          <dd>{sku.brand}</dd>
        </div>
        <div>
          <dt>{t('cat.code')}</dt>
          <dd>{sku.code}</dd>
        </div>
      </dl>
      {scheme && <p class="scheme scheme-large">{schemeLabel(scheme)}</p>}
      {out ? (
        <p class="notice notice-muted">{t('cat.out')}</p>
      ) : (
        <div class="qty-rows">
          <div class="qty-row">
            <span>{t('cat.casesLabel')}</span>
            <Stepper
              value={line.cases}
              max={fullCases(sku)}
              label={t('cat.casesLabel')}
              onChange={(next) => setLine(sku.id, next, line.pieces)}
            />
          </div>
          <div class="qty-row">
            <span>{t('cat.piecesLabel')}</span>
            <Stepper
              value={line.pieces}
              max={sku.stockPieces}
              label={t('cat.piecesLabel')}
              onChange={(next) => setLine(sku.id, line.cases, next)}
            />
          </div>
        </div>
      )}
      <button type="button" class="btn btn-primary btn-block" onClick={onClose}>
        {t('done')}
      </button>
    </Sheet>
  );
}

function RepeatLastOrder({ order }: { order: LastOrder }) {
  const t = useT();
  const [, navigate] = useLocation();
  const [busy, setBusy] = useState(false);

  async function repeat() {
    setBusy(true);
    try {
      const { skipped } = await repeatOrder(order.id);
      showToast(
        skipped.length > 0 ? t('orders.repeatedSkipped', { names: skipped.join(', ') }) : t('orders.repeated'),
      );
      navigate('/cart');
    } catch (err) {
      showToast(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <button type="button" class="repeat" disabled={busy} onClick={() => void repeat()}>
      <RepeatIcon />
      <span class="repeat-text">
        <strong>{t('cat.repeat')}</strong>
        <span class="muted">
          {t('cat.repeatDetail', { items: itemCount(order.lineCount), total: formatRupees(order.totalPaise) })}
        </span>
      </span>
      <ChevronIcon size={18} />
    </button>
  );
}

function CartBar() {
  const t = useT();
  const { data } = home.use();
  const { lines, quote } = usePricedCart(data);
  const count = lineCount(lines);
  if (count === 0 || !quote) return null;

  return (
    <Link href="/cart" class="cart-bar">
      <span>
        <strong>{itemCount(count)}</strong>
        <span class="cart-bar-total">
          {formatRupees(quote.totalPaise)} {t('bar.inclGst')}
        </span>
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

export function CatalogueScreen({ shopName }: { shopName: string }) {
  const t = useT();
  const { data, error, stale } = home.use();
  const lines = cart.use();
  const online = useOnline();
  const [query, setQuery] = useState(browsing.query);
  const [category, setCategory] = useState(browsing.category);
  const [openSkuId, setOpenSkuId] = useState<string | null>(null);

  const schemeBySku = useMemo(() => new Map(data?.schemes.map((s) => [s.skuId, s])), [data]);
  const categories = useMemo(() => [...new Set(data?.skus.map((s) => s.category))], [data]);

  const visible = useMemo(() => {
    const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
    const usualRank = new Map(data?.usualSkuIds.map((id, rank) => [id, rank]));
    const rankOf = (sku: CatalogueSku) => usualRank.get(sku.id) ?? Infinity;
    return (data?.skus ?? [])
      .filter((sku) => (!category || sku.category === category) && matches(sku, terms))
      .sort((a, b) => (rankOf(a) === rankOf(b) ? 0 : rankOf(a) - rankOf(b)));
  }, [data, query, category]);

  const openSku = data?.skus.find((s) => s.id === openSkuId);

  return (
    <>
      <div class="shop-head-row">
        <div>
          <p class="shop-name">{shopName}</p>
          {data && (
            <p class="shop-credit">
              {t('cat.credit')} <strong>{formatRupees(data.credit.availablePaise)}</strong>
            </p>
          )}
        </div>
        <LanguageToggle />
      </div>
      <header class="shop-head">
        <label class="search">
          <SearchIcon size={20} />
          <input
            type="search"
            placeholder={t('cat.search')}
            aria-label={t('cat.search')}
            value={query}
            onInput={(e) => {
              browsing.query = e.currentTarget.value;
              setQuery(e.currentTarget.value);
            }}
          />
        </label>
        {categories.length > 1 && (
          <div class="chips" role="group" aria-label="Categories">
            {['', ...categories].map((name) => (
              <button
                key={name}
                type="button"
                class="chip"
                aria-pressed={category === name}
                onClick={() => {
                  browsing.category = name;
                  setCategory(name);
                }}
              >
                {name ? categoryName(name) : t('cat.all')}
              </button>
            ))}
          </div>
        )}
      </header>

      <main class="page">
        {!online && data && (
          <p class="notice notice-warn">{t('cat.offline', { time: formatTime(data.asOf) })}</p>
        )}
        {online && stale && error?.isNetwork && data && (
          <p class="notice notice-warn">{t('cat.offline', { time: formatTime(data.asOf) })}</p>
        )}

        {!data && error && <ErrorState message={error.message} onRetry={() => void refreshHome()} />}
        {!data && !error && <SkeletonGrid />}

        {data && (
          <>
            {data.lastOrder && !query && !category && <RepeatLastOrder order={data.lastOrder} />}
            {visible.length === 0 ? (
              <EmptyState title={t('cat.emptyTitle', { query })} hint={t('cat.emptyHint')}>
                <Link href="/quick" class="btn btn-quiet">
                  {t('cat.typeOrder')}
                </Link>
              </EmptyState>
            ) : (
              <div class="grid">
                {visible.map((sku) => (
                  <ProductCard
                    key={sku.id}
                    sku={sku}
                    scheme={schemeBySku.get(sku.id)}
                    line={lines[sku.id]}
                    onOpen={() => setOpenSkuId(sku.id)}
                  />
                ))}
              </div>
            )}
          </>
        )}
      </main>

      <CartBar />

      {openSku && (
        <ProductSheet sku={openSku} scheme={schemeBySku.get(openSku.id)} onClose={() => setOpenSkuId(null)} />
      )}
    </>
  );
}
