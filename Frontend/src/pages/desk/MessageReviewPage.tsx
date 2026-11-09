import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Link, Redirect, useLocation } from 'wouter-preact';
import { ApiError } from '../../api/client.ts';
import { confirmCapture, getCapture, quoteCapture, rejectCapture } from '../../api/desk.ts';
import type {
  CaptureDetail,
  CaptureLineView,
  CaptureReason,
  CartItem,
  CatalogueSku,
  ConfidenceBand,
  ConfirmCaptureResult,
  ConfirmLine,
  PricedLine,
  Quote,
} from '../../api/types.ts';
import { formatRupees, shortName } from '../../components/format.ts';
import { BackIcon, CheckIcon } from '../../components/icons.tsx';
import { ErrorState, Loading } from '../../components/states.tsx';
import { showToast } from '../../components/toast.tsx';
import { useAsync } from '../../components/useAsync.ts';

interface LineState {
  skuId: string | null;
  quantity: number | null;
  unit: 'CASE' | 'PIECE' | null;
  dropped: boolean;
}

type LineProblem = 'NEEDS_SKU' | 'NEEDS_QUANTITY' | 'NEEDS_UNIT' | 'SHORT';

const QUOTE_DELAY_MS = 300;

const BAND_LABEL: Record<ConfidenceBand, string> = {
  HIGH: 'High confidence',
  MEDIUM: 'Medium confidence',
  LOW: 'Low confidence',
};

const REASON_LABEL: Record<CaptureReason, string> = {
  ALIAS: 'Learned from a past correction',
  HISTORY: 'Ordered before',
  MATCH: 'Matches the words used',
  UNSURE: 'Please choose the right item',
};

function initialState(line: CaptureLineView): LineState {
  return {
    // Only a confident match is pre-selected. Anything else stays empty until a person chooses.
    skuId: line.band === 'HIGH' ? line.suggestedSkuId : null,
    quantity: line.quantity,
    unit: line.unit === 'UNCLEAR' ? null : line.unit,
    dropped: false,
  };
}

const isOut = (sku: CatalogueSku | undefined) => sku?.stockPieces === 0;

/** Whether this line is going to be part of the order. Out of stock lines cannot be. */
const isIncluded = (state: LineState, sku: CatalogueSku | undefined) => !state.dropped && !isOut(sku);

function piecesOf(state: LineState, sku: CatalogueSku): number {
  if (state.quantity === null || state.unit === null) return 0;
  return state.unit === 'CASE' ? state.quantity * sku.unitsPerCase : state.quantity;
}

function lineProblem(state: LineState, sku: CatalogueSku | undefined): LineProblem | null {
  if (state.dropped) return null;
  if (!sku) return 'NEEDS_SKU';
  if (isOut(sku)) return null;
  if (state.quantity === null || state.quantity <= 0) return 'NEEDS_QUANTITY';
  if (state.unit === null) return 'NEEDS_UNIT';
  if (piecesOf(state, sku) > sku.stockPieces) return 'SHORT';
  return null;
}

function SkuOption({
  sku,
  group,
  checked,
  note,
  onSelect,
}: {
  sku: CatalogueSku;
  group: string;
  checked: boolean;
  note?: string;
  onSelect: () => void;
}) {
  return (
    <label class={`option${checked ? ' option-on' : ''}`}>
      <input type="radio" name={group} checked={checked} onChange={onSelect} />
      <span class="option-text">
        <span class="option-name">{shortName(sku.name)}</span>
        {note && <span class="option-note">{note}</span>}
      </span>
      <span class="option-price">
        {isOut(sku) ? (
          <span class="tag tag-muted">Out of stock</span>
        ) : (
          <>
            {formatRupees(sku.unitPricePaise * sku.unitsPerCase)}
            <span class="muted">/case</span>
          </>
        )}
      </span>
    </label>
  );
}

function ReviewLine({
  line,
  state,
  skus,
  allSkus,
  priced,
  problem,
  onChange,
}: {
  line: CaptureLineView;
  state: LineState;
  skus: Map<string, CatalogueSku>;
  allSkus: CatalogueSku[];
  priced: PricedLine | undefined;
  problem: LineProblem | null;
  onChange: (patch: Partial<LineState>) => void;
}) {
  const selected = state.skuId ? skus.get(state.skuId) : undefined;
  const stockCases = selected ? Math.floor(selected.stockPieces / selected.unitsPerCase) : 0;
  const optionIds = [
    ...new Set(
      [state.skuId, line.suggestedSkuId, ...line.alternativeSkuIds].filter((id): id is string => id !== null),
    ),
  ];

  if (state.dropped) {
    return (
      <section class="rline rline-dropped">
        <q class="rline-words">{line.originalWords}</q>
        <p class="muted">Left out of this order</p>
        <button type="button" class="link" onClick={() => onChange({ dropped: false })}>
          Put back
        </button>
      </section>
    );
  }

  return (
    <section class={`rline${problem ? ' rline-attention' : ''}`}>
      <header class="rline-head">
        <q class="rline-words">{line.originalWords}</q>
        <span class={`conf conf-${line.band.toLowerCase()}`}>{BAND_LABEL[line.band]}</span>
      </header>

      <div class="options" role="radiogroup" aria-label={line.originalWords}>
        {optionIds.map((id) => {
          const sku = skus.get(id);
          if (!sku) return null;
          return (
            <SkuOption
              key={id}
              sku={sku}
              group={`line-${line.id}`}
              checked={state.skuId === id}
              note={id === line.suggestedSkuId ? REASON_LABEL[line.reason] : undefined}
              onSelect={() => onChange({ skuId: id })}
            />
          );
        })}
      </div>

      <label class="field other-item">
        <span class="field-label">None of these?</span>
        <select
          class="input"
          value=""
          onChange={(e) => {
            if (e.currentTarget.value) onChange({ skuId: e.currentTarget.value });
          }}
        >
          <option value="">Choose another item</option>
          {allSkus.map((sku) => (
            <option key={sku.id} value={sku.id}>
              {shortName(sku.name)}
            </option>
          ))}
        </select>
      </label>

      {selected && isOut(selected) ? (
        <p class="notice notice-muted">Out of stock. This line will be left out unless you pick another item.</p>
      ) : (
        <div class="rline-qty">
          <label class="qty-field">
            <span class={state.quantity === null ? 'ask' : 'field-label'}>
              {state.quantity === null ? 'How many?' : 'Quantity'}
            </span>
            <input
              class="input input-qty"
              inputMode="numeric"
              maxLength={5}
              value={state.quantity ?? ''}
              onInput={(e) => {
                const digits = e.currentTarget.value.replace(/\D/g, '');
                onChange({ quantity: digits ? Number(digits) : null });
              }}
            />
          </label>
          <div class="unit-field">
            <span class={state.unit === null ? 'ask' : 'field-label'}>
              {state.unit === null ? 'Case or piece?' : 'Unit'}
            </span>
            <div class="segmented" role="group">
              {(['CASE', 'PIECE'] as const).map((unit) => (
                <button key={unit} type="button" aria-pressed={state.unit === unit} onClick={() => onChange({ unit })}>
                  {unit === 'CASE' ? 'Case' : 'Piece'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {problem === 'SHORT' && (
        <p class="notice notice-warn">
          Only {stockCases} cases in stock.{' '}
          <button type="button" class="link" onClick={() => onChange({ quantity: stockCases, unit: 'CASE' })}>
            Use {stockCases}
          </button>
        </p>
      )}

      {priced && priced.stock === 'OK' && priced.freeCases > 0 && <p class="line-gain">+ {priced.freeCases} free</p>}
      {priced && priced.stock === 'OK' && priced.discountPaise > 0 && priced.applied && (
        <p class="line-gain">
          {priced.applied.label} · saves {formatRupees(priced.discountPaise)}
        </p>
      )}

      <button type="button" class="link link-quiet" onClick={() => onChange({ dropped: true })}>
        Leave out
      </button>
    </section>
  );
}

function Review({
  capture,
  onConfirmed,
  onStale,
}: {
  capture: CaptureDetail;
  onConfirmed: (result: ConfirmCaptureResult) => void;
  onStale: () => void;
}) {
  const [, navigate] = useLocation();
  const [states, setStates] = useState<LineState[]>(() => capture.lines.map(initialState));
  const [quote, setQuote] = useState<Quote | null>(null);
  const [pricing, setPricing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latest = useRef(0);

  const skus = useMemo(() => new Map(capture.catalogue.skus.map((s) => [s.id, s])), [capture]);
  const skuOf = (state: LineState) => (state.skuId ? skus.get(state.skuId) : undefined);

  const problems = states.map((state) => lineProblem(state, skuOf(state)));
  const openProblems = problems.filter(Boolean).length;

  const items: CartItem[] = states.flatMap((state) => {
    const sku = skuOf(state);
    if (!sku || !isIncluded(state, sku) || !state.quantity || state.unit === null) return [];
    return [{
      skuId: sku.id,
      cases: state.unit === 'CASE' ? state.quantity : 0,
      pieces: state.unit === 'PIECE' ? state.quantity : 0,
    }];
  });
  const itemsKey = JSON.stringify(items);

  useEffect(() => {
    const id = ++latest.current;
    if (items.length === 0) {
      setQuote(null);
      setPricing(false);
      return;
    }
    setPricing(true);
    const timer = setTimeout(() => {
      quoteCapture(capture.id, items)
        .then((result) => {
          if (id !== latest.current) return;
          setQuote(result);
          setPricing(false);
        })
        .catch((err: unknown) => {
          if (id !== latest.current) return;
          setError(err instanceof Error ? err.message : 'Could not price this order.');
          setPricing(false);
        });
    }, QUOTE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [itemsKey]);

  const pricedBySku = new Map(quote?.lines.map((l) => [l.skuId, l]));
  const totalPaise = items.length > 0 ? (quote?.totalPaise ?? 0) : 0;
  const { limitPaise, outstandingPaise, openOrdersPaise } = capture.credit;
  const overCredit = Math.max(0, outstandingPaise + openOrdersPaise + totalPaise - limitPaise);
  const leftOut = states.filter((s) => !isIncluded(s, skuOf(s))).length;
  const canConfirm = openProblems === 0 && items.length > 0 && !!quote && !quote.blocked && !pricing;

  function update(index: number, patch: Partial<LineState>) {
    setStates((current) => current.map((s, i) => (i === index ? { ...s, ...patch } : s)));
  }

  async function confirm() {
    const lines = capture.lines.map((line, i): ConfirmLine => {
      const state = states[i]!;
      const sku = skuOf(state);
      if (!sku || !isIncluded(state, sku)) return { lineId: line.id, action: 'DROP' };
      return { lineId: line.id, action: 'ORDER', skuId: sku.id, quantity: state.quantity!, unit: state.unit! };
    });

    setBusy(true);
    setError(null);
    try {
      onConfirmed(await confirmCapture(capture.id, lines, totalPaise));
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        showToast(err.message);
        onStale();
      } else {
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
      setBusy(false);
    }
  }

  async function reject() {
    setBusy(true);
    try {
      await rejectCapture(capture.id);
      navigate('/desk/messages');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
      setBusy(false);
    }
  }

  const status =
    items.length === 0 && openProblems === 0
      ? 'Every line is left out'
      : openProblems > 1
        ? `${openProblems} lines need a decision`
        : openProblems === 1
          ? '1 line needs a decision'
          : leftOut > 0
            ? `${leftOut} left out`
            : 'Total including GST';

  return (
    <div class="dreview">
      <section class="message">
        <p class="message-label">WhatsApp from {capture.retailer.shopName}</p>
        <blockquote class="message-bubble">{capture.rawText}</blockquote>
        <p class="message-engine">{capture.engineNote ?? 'Read by AI'}</p>
      </section>

      {capture.lines.map((line, i) => {
        const state = states[i]!;
        return (
          <ReviewLine
            key={line.id}
            line={line}
            state={state}
            skus={skus}
            allSkus={capture.catalogue.skus}
            priced={state.skuId ? pricedBySku.get(state.skuId) : undefined}
            problem={problems[i] ?? null}
            onChange={(patch) => update(i, patch)}
          />
        );
      })}

      {error && (
        <p class="notice notice-danger" role="alert">
          {error}
        </p>
      )}

      {overCredit > 0 && items.length > 0 && (
        <p class="notice notice-warn">Over credit by {formatRupees(overCredit)}. This order will go on hold.</p>
      )}

      <button type="button" class="btn btn-quiet btn-block" disabled={busy} onClick={() => void reject()}>
        Reject message
      </button>

      <footer class="footer">
        <div class={`footer-total${pricing ? ' is-updating' : ''}`}>
          <span class="muted">{status}</span>
          <strong>{formatRupees(totalPaise)}</strong>
        </div>
        <button type="button" class="btn btn-primary" disabled={!canConfirm || busy} onClick={() => void confirm()}>
          Confirm order
        </button>
      </footer>
    </div>
  );
}

function ConfirmedPanel({ result }: { result: ConfirmCaptureResult }) {
  return (
    <div class="dresult">
      <p class="notice notice-success">
        <CheckIcon size={18} />
        Order {result.order.label} placed
      </p>
      {result.order.status === 'CREDIT_HOLD' && (
        <p class="notice notice-warn">It is over the shop's credit limit, so it is on credit hold.</p>
      )}
      {result.aliasesLearned > 0 && (
        <p class="notice notice-muted">
          {result.aliasesLearned === 1
            ? '1 correction remembered for this shop.'
            : `${result.aliasesLearned} corrections remembered for this shop.`}{' '}
          The next message with those words will match automatically.
        </p>
      )}
      <div class="dnew-actions">
        <Link href="/desk/messages" class="btn btn-primary">
          Next message
        </Link>
        <Link href={`/desk/orders/${result.order.id}`} class="btn btn-quiet">
          Open order
        </Link>
      </div>
    </div>
  );
}

export function MessageReviewPage({ id }: { id: string }) {
  const { data, error, loading, reload } = useAsync(() => getCapture(id), [id]);
  const [result, setResult] = useState<ConfirmCaptureResult | null>(null);
  const [revision, setRevision] = useState(0);

  if (!result && data && data.status !== 'NEEDS_REVIEW') return <Redirect to="/desk/messages" replace />;

  return (
    <>
      <header class="dhead">
        <div class="dhead-back">
          <Link href="/desk/messages" class="icon-btn" aria-label="Back to messages">
            <BackIcon />
          </Link>
          <h1 class="dtitle">{data?.retailer.shopName ?? 'Message'}</h1>
        </div>
      </header>

      {loading && !data && <Loading />}
      {error && !data && <ErrorState message={error.message} onRetry={reload} />}
      {result && <ConfirmedPanel result={result} />}
      {!result && data && (
        <Review
          key={revision}
          capture={data}
          onConfirmed={setResult}
          onStale={() => {
            reload();
            setRevision((n) => n + 1);
          }}
        />
      )}
    </>
  );
}
