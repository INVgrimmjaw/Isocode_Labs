import { useMemo, useState } from 'preact/hooks';
import type {
  CaptureDetail,
  CaptureLineView,
  CatalogueSku,
  ConfidenceBand,
  ConfirmCaptureBody,
  ConfirmCaptureResult,
  ConfirmLine,
} from '#shared/api';
import { formatPercent, formatRupees } from '#shared/money';
import { priceCart, type CartItem, type PricedLine } from '#shared/pricing';
import { ApiError, errorMessage } from '../lib/api.ts';
import { shortName } from '../lib/format.ts';
import { caseCount, locale, useT, type StringKey, type Translate } from '../lib/i18n.ts';
import { Sheet } from './Sheet.tsx';
import { showToast } from './toast.tsx';
import { SearchIcon } from './icons.tsx';

interface LineState {
  skuId: string | null;
  quantity: number | null;
  unit: 'CASE' | 'PIECE' | null;
  dropped: boolean;
  /** Reviewer has confirmed a quantity that looked wrong. */
  quantityChecked: boolean;
}

type LineProblem = 'NEEDS_SKU' | 'NEEDS_QUANTITY' | 'NEEDS_UNIT' | 'CHECK_QUANTITY' | 'SHORT';

function initialState(line: CaptureLineView): LineState {
  return {
    // Only a confident match is pre-selected. Anything else stays empty until a person chooses.
    skuId: line.band === 'HIGH' ? line.suggestedSkuId : null,
    quantity: line.quantity,
    unit: line.unit === 'UNCLEAR' ? null : line.unit,
    dropped: false,
    quantityChecked: false,
  };
}

function piecesOf(state: LineState, sku: CatalogueSku): number {
  if (state.quantity === null || state.unit === null) return 0;
  return state.unit === 'CASE' ? state.quantity * sku.unitsPerCase : state.quantity;
}

const isOut = (sku: CatalogueSku | undefined) => sku?.stockPieces === 0;

/** Whether this line is going to be part of the order. Out of stock lines cannot be. */
function isIncluded(state: LineState, sku: CatalogueSku | undefined): boolean {
  return !state.dropped && !isOut(sku);
}

function lineProblem(
  line: CaptureLineView,
  state: LineState,
  sku: CatalogueSku | undefined,
): LineProblem | null {
  if (state.dropped) return null;
  if (!sku) return 'NEEDS_SKU';
  if (isOut(sku)) return null;
  if (state.quantity === null || state.quantity <= 0) return 'NEEDS_QUANTITY';
  if (state.unit === null) return 'NEEDS_UNIT';
  if (piecesOf(state, sku) > sku.stockPieces) return 'SHORT';
  if (line.flags.length > 0 && !state.quantityChecked) return 'CHECK_QUANTITY';
  return null;
}

const BAND_LABEL: Record<ConfidenceBand, StringKey> = {
  HIGH: 'review.high',
  MEDIUM: 'review.medium',
  LOW: 'review.low',
};

function Confidence({ band }: { band: ConfidenceBand }) {
  const t = useT();
  return <span class={`conf conf-${band.toLowerCase()}`}>{t(BAND_LABEL[band])}</span>;
}

const displayName = (sku: CatalogueSku) => (locale.get() === 'hi' ? sku.nameHi : shortName(sku.name));

function SkuOption({
  sku,
  name,
  checked,
  note,
  onSelect,
}: {
  sku: CatalogueSku;
  name: string;
  checked: boolean;
  note?: string;
  onSelect: () => void;
}) {
  const t = useT();
  return (
    <label class={`option${checked ? ' option-on' : ''}`}>
      <input type="radio" name={name} checked={checked} onChange={onSelect} />
      <span class="option-text">
        <span class="option-name">{displayName(sku)}</span>
        {note && <span class="option-note">{note}</span>}
      </span>
      <span class="option-price">
        {isOut(sku) ? (
          <span class="tag tag-muted">{t('cat.out')}</span>
        ) : (
          <>
            {formatRupees(sku.unitPricePaise * sku.unitsPerCase)}
            <span class="muted">/{t('cat.perCase')}</span>
          </>
        )}
      </span>
    </label>
  );
}

function PricingNote({ priced, t }: { priced: PricedLine | undefined; t: Translate }) {
  if (!priced || priced.stock !== 'OK') return null;
  return (
    <>
      {priced.freeCases > 0 && <p class="line-gain">{t('cart.free', { cases: caseCount(priced.freeCases) })}</p>}
      {priced.discountPaise > 0 && priced.applied && (
        <p class="line-gain">
          {t('cart.discount', {
            label: locale.get() === 'hi' ? priced.applied.labelHi : priced.applied.label,
            amount: formatRupees(priced.discountPaise),
          })}
        </p>
      )}
      {priced.nudge && (
        <p class="line-note">
          {priced.nudge.kind === 'FREE_GOODS'
            ? t('cart.nudgeFree', { count: priced.nudge.casesToAdd, free: caseCount(priced.nudge.freeCases) })
            : t('cart.nudgeSlab', {
                count: priced.nudge.casesToAdd,
                rate: formatPercent(priced.nudge.discountBps),
              })}
        </p>
      )}
    </>
  );
}

function ReviewLine({
  line,
  state,
  skus,
  priced,
  problem,
  onChange,
  onPickOther,
}: {
  line: CaptureLineView;
  state: LineState;
  skus: Map<string, CatalogueSku>;
  priced: PricedLine | undefined;
  problem: LineProblem | null;
  onChange: (patch: Partial<LineState>) => void;
  onPickOther: () => void;
}) {
  const t = useT();
  const selected = state.skuId ? skus.get(state.skuId) : undefined;

  const optionIds = [
    ...new Set(
      [state.skuId, line.suggestedSkuId, ...line.alternativeSkuIds].filter((id): id is string => id !== null),
    ),
  ];

  if (state.dropped) {
    return (
      <section class="rline rline-dropped">
        <q class="rline-words">{line.originalWords}</q>
        <p class="muted">{t('review.leftOut')}</p>
        <button type="button" class="link" onClick={() => onChange({ dropped: false })}>
          {t('review.putBack')}
        </button>
      </section>
    );
  }

  const stockCases = selected ? Math.floor(selected.stockPieces / selected.unitsPerCase) : 0;

  return (
    <section class={`rline${problem ? ' rline-attention' : ''}`}>
      <header class="rline-head">
        <q class="rline-words">{line.originalWords}</q>
        <Confidence band={line.band} />
      </header>

      <div class="options" role="radiogroup" aria-label={line.originalWords}>
        {optionIds.map((id) => {
          const sku = skus.get(id);
          if (!sku) return null;
          return (
            <SkuOption
              key={id}
              sku={sku}
              name={`line-${line.id}`}
              checked={state.skuId === id}
              note={id === line.suggestedSkuId ? t(`review.reason.${line.reason}` as StringKey) : undefined}
              onSelect={() => onChange({ skuId: id })}
            />
          );
        })}
      </div>

      <button type="button" class="link" onClick={onPickOther}>
        {t('review.chooseOther')}
      </button>

      {selected && isOut(selected) ? (
        <p class="notice notice-muted">{t('review.outOfStock')}</p>
      ) : (
        <div class="rline-qty">
          <label class="qty-field">
            <span class={problem === 'NEEDS_QUANTITY' ? 'ask' : 'field-label'}>
              {problem === 'NEEDS_QUANTITY' ? t('review.askQuantity') : t('review.quantity')}
            </span>
            <input
              class="input input-qty"
              inputMode="numeric"
              value={state.quantity ?? ''}
              onInput={(e) => {
                const digits = e.currentTarget.value.replace(/\D/g, '');
                onChange({ quantity: digits ? Number(digits) : null, quantityChecked: true });
              }}
            />
          </label>
          <div class="unit-field">
            <span class={problem === 'NEEDS_UNIT' ? 'ask' : 'field-label'}>
              {problem === 'NEEDS_UNIT' ? t('review.askUnit') : t('review.unit')}
            </span>
            <div class="segmented" role="group">
              {(['CASE', 'PIECE'] as const).map((unit) => (
                <button
                  key={unit}
                  type="button"
                  aria-pressed={state.unit === unit}
                  onClick={() => onChange({ unit })}
                >
                  {t(unit === 'CASE' ? 'review.case' : 'review.piece')}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {problem === 'SHORT' && (
        <p class="notice notice-warn">
          {t('review.short', { count: stockCases })}{' '}
          <button
            type="button"
            class="link"
            onClick={() => onChange({ quantity: stockCases, unit: 'CASE', quantityChecked: true })}
          >
            {t('review.useAvailable', { count: stockCases })}
          </button>
        </p>
      )}

      {problem === 'CHECK_QUANTITY' && (
        <p class="notice notice-warn">
          {line.flags.includes('QTY_DISAGREE')
            ? t('review.disagree')
            : line.usualMaxCases
              ? t('review.unusualQty', { cases: caseCount(line.usualMaxCases) })
              : t('review.unusualQtyNew')}{' '}
          <button type="button" class="link" onClick={() => onChange({ quantityChecked: true })}>
            {t('review.yesCorrect', { count: state.quantity ?? 0 })}
          </button>
        </p>
      )}

      <PricingNote priced={priced} t={t} />

      <button type="button" class="link link-quiet" onClick={() => onChange({ dropped: true })}>
        {t('review.leaveOut')}
      </button>
    </section>
  );
}

function SkuPicker({
  skus,
  onPick,
  onClose,
}: {
  skus: CatalogueSku[];
  onPick: (skuId: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const [query, setQuery] = useState('');
  const terms = query.toLowerCase().split(/\s+/).filter(Boolean);
  const results = skus.filter((sku) => {
    const text = `${sku.name} ${sku.nameHi} ${sku.code} ${sku.keywords.join(' ')}`.toLowerCase();
    return terms.every((term) => text.includes(term));
  });

  return (
    <Sheet title={t('review.chooseOther')} onClose={onClose}>
      <label class="search">
        <SearchIcon size={20} />
        <input
          type="search"
          autoFocus
          placeholder={t('review.searchItems')}
          aria-label={t('review.searchItems')}
          value={query}
          onInput={(e) => setQuery(e.currentTarget.value)}
        />
      </label>
      <ul class="picker">
        {results.map((sku) => (
          <li key={sku.id}>
            <button type="button" class="picker-item" onClick={() => onPick(sku.id)}>
              <span>{displayName(sku)}</span>
              {isOut(sku) ? (
                <span class="tag tag-muted">{t('cat.out')}</span>
              ) : (
                <span class="muted">{formatRupees(sku.unitPricePaise * sku.unitsPerCase)}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}

export function CaptureReview({
  capture,
  messageLabel,
  showEngine,
  submit,
  discard,
  onConfirmed,
  onDiscarded,
  onStale,
}: {
  capture: CaptureDetail;
  messageLabel: string;
  /** Which reader produced the lines matters to the desk, not to a shopkeeper. */
  showEngine?: boolean;
  submit: (body: ConfirmCaptureBody) => Promise<ConfirmCaptureResult>;
  discard: () => Promise<unknown>;
  onConfirmed: (result: ConfirmCaptureResult) => void;
  onDiscarded: () => void;
  onStale: () => void;
}) {
  const t = useT();
  const [states, setStates] = useState<LineState[]>(() => capture.lines.map(initialState));
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const skus = useMemo(() => new Map(capture.catalogue.skus.map((s) => [s.id, s])), [capture]);
  const skuOf = (state: LineState) => (state.skuId ? skus.get(state.skuId) : undefined);

  const problems = capture.lines.map((line, i) => lineProblem(line, states[i]!, skuOf(states[i]!)));
  const openProblems = problems.filter(Boolean).length;

  const items: CartItem[] = states.flatMap((state) => {
    const sku = skuOf(state);
    if (!sku || !isIncluded(state, sku) || state.quantity === null || state.unit === null) return [];
    return [{
      skuId: sku.id,
      cases: state.unit === 'CASE' ? state.quantity : 0,
      pieces: state.unit === 'PIECE' ? state.quantity : 0,
    }];
  });

  const quote = priceCart(items, skus, capture.catalogue.schemes, new Date());
  const pricedBySku = new Map(quote.lines.map((l) => [l.skuId, l]));

  const { limitPaise, outstandingPaise, openOrdersPaise } = capture.credit;
  const overCredit = Math.max(0, outstandingPaise + openOrdersPaise + quote.totalPaise - limitPaise);
  const leftOut = states.filter((s) => !isIncluded(s, skuOf(s))).length;
  const canConfirm = openProblems === 0 && items.length > 0 && !quote.blocked;

  function update(index: number, patch: Partial<LineState>) {
    setStates((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function confirm() {
    const lines = capture.lines.map((line, i): ConfirmLine => {
      const state = states[i]!;
      const sku = skuOf(state);
      if (!sku || !isIncluded(state, sku)) return { lineId: line.id, action: 'DROP' };
      return {
        lineId: line.id,
        action: 'ORDER',
        skuId: sku.id,
        quantity: state.quantity!,
        unit: state.unit!,
      };
    });

    setBusy(true);
    setError(null);
    try {
      onConfirmed(await submit({ lines, expectedTotalPaise: quote.totalPaise }));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        showToast(err.message);
        onStale();
      } else {
        setError(errorMessage(err));
      }
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await discard();
      onDiscarded();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  const status =
    items.length === 0 && openProblems === 0
      ? t('review.nothingLeft')
      : openProblems > 1
        ? t('review.needsDecision', { count: openProblems })
        : openProblems === 1
          ? t('review.needsOne')
          : null;

  return (
    <>
      <section class="message">
        <p class="message-label">{messageLabel}</p>
        <blockquote class="message-bubble">{capture.rawText}</blockquote>
        {showEngine && (
          <p class="message-engine">
            {capture.engineNote ?? t(capture.engine === 'CLAUDE' ? 'review.engineClaude' : 'review.engineMatcher')}
          </p>
        )}
      </section>

      {capture.lines.map((line, i) => {
        const state = states[i]!;
        return (
          <ReviewLine
            key={line.id}
            line={line}
            state={state}
            skus={skus}
            priced={state.skuId ? pricedBySku.get(state.skuId) : undefined}
            problem={problems[i] ?? null}
            onChange={(patch) => update(i, patch)}
            onPickOther={() => setPickerFor(i)}
          />
        );
      })}

      {error && (
        <p class="notice notice-danger" role="alert">
          {error}
        </p>
      )}

      {overCredit > 0 && items.length > 0 && (
        <p class="notice notice-warn">{t('review.overCredit', { amount: formatRupees(overCredit) })}</p>
      )}

      <button type="button" class="btn btn-quiet btn-block" disabled={busy} onClick={() => void reject()}>
        {t('review.discard')}
      </button>

      <footer class="footer">
        <div class="footer-total">
          <span class="muted">
            {status ?? (leftOut > 0 ? t('review.excluded', { count: leftOut }) : t('review.total'))}
          </span>
          <strong>{formatRupees(quote.totalPaise)}</strong>
        </div>
        <button
          type="button"
          class="btn btn-primary"
          disabled={!canConfirm || busy}
          onClick={() => void confirm()}
        >
          {t('review.confirm')}
        </button>
      </footer>

      {pickerFor !== null && (
        <SkuPicker
          skus={capture.catalogue.skus}
          onClose={() => setPickerFor(null)}
          onPick={(skuId) => {
            update(pickerFor, { skuId });
            setPickerFor(null);
          }}
        />
      )}
    </>
  );
}
