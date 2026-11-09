import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import type {
  CaptureDetail,
  CaptureStatus,
  CaptureSummary,
  ConfirmCaptureBody,
  ConfirmCaptureResult,
  RetailerOption,
} from '#shared/api';
import { CaptureReview } from '../components/CaptureReview.tsx';
import { BackIcon, CheckIcon, ChevronIcon } from '../components/icons.tsx';
import { EmptyState, ErrorState, Loading } from '../components/states.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { formatDateTime, shortName } from '../lib/format.ts';
import { useAsync } from '../lib/hooks.ts';
import { refreshCounts } from './DeskApp.tsx';

const READ_TIMEOUT_MS = 45_000;

const TABS: { value: CaptureStatus; label: string }[] = [
  { value: 'NEEDS_REVIEW', label: 'To check' },
  { value: 'CONFIRMED', label: 'Confirmed' },
  { value: 'REJECTED', label: 'Rejected' },
];

const SAMPLES = [
  'bhaiya 5 peti biscuit chhota, 2 peti washing powder 1 kilo, chai patti 250 wala 1 peti',
  'biscuit 5, chai 100 wala 2 dabba',
  '5 पेटी क्रीम बिस्कुट और 2 पेटी नमकीन 200 ग्राम',
];

function NewMessage({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [retailerId, setRetailerId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retailers = useAsync(() => api<RetailerOption[]>('/api/desk/retailers'), []);

  async function submit(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const capture = await api<CaptureDetail>('/api/desk/captures', {
        body: { retailerId, text },
        timeoutMs: READ_TIMEOUT_MS,
      });
      refreshCounts();
      onCreated(capture.id);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" class="btn btn-quiet" onClick={() => setOpen(true)}>
        Add a WhatsApp message
      </button>
    );
  }

  return (
    <form class="dpanel dnew" onSubmit={submit}>
      <p class="muted">
        WhatsApp is simulated in this demo. Paste a message as if it had arrived from a shop.
      </p>
      <label class="field">
        <span class="field-label">From</span>
        <select
          class="input"
          required
          value={retailerId}
          onChange={(e) => setRetailerId(e.currentTarget.value)}
        >
          <option value="">Choose a shop</option>
          {retailers.data?.map((r) => (
            <option key={r.id} value={r.id}>
              {r.shopName}, {r.area}
            </option>
          ))}
        </select>
      </label>
      <label class="field">
        <span class="field-label">Message</span>
        <textarea
          class="input textarea"
          rows={4}
          required
          maxLength={2000}
          value={text}
          onInput={(e) => setText(e.currentTarget.value)}
        />
      </label>
      <div class="dsamples">
        <span class="muted">Try:</span>
        {SAMPLES.map((sample) => (
          <button key={sample} type="button" class="dsample" onClick={() => setText(sample)}>
            {sample.length > 34 ? `${sample.slice(0, 34)}…` : sample}
          </button>
        ))}
      </div>
      {error && (
        <p class="notice notice-danger" role="alert">
          {error}
        </p>
      )}
      <div class="dnew-actions">
        <button class="btn btn-primary" disabled={busy || !retailerId || text.trim().length < 2}>
          {busy ? 'Reading the message' : 'Read message'}
        </button>
        <button type="button" class="link link-quiet" onClick={() => setOpen(false)}>
          Cancel
        </button>
      </div>
    </form>
  );
}

export function DeskInboxScreen() {
  const [, navigate] = useLocation();
  const [tab, setTab] = useState<CaptureStatus>('NEEDS_REVIEW');
  const { data, error, loading, reload } = useAsync(
    () => api<CaptureSummary[]>(`/api/desk/captures?status=${tab}`),
    [tab],
  );

  return (
    <>
      <header class="dhead">
        <h1 class="dtitle">Messages</h1>
        <NewMessage onCreated={(id) => navigate(`/desk/inbox/${id}`)} />
      </header>

      <div class="dfilters" role="group" aria-label="Filter messages">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            class="chip"
            aria-pressed={tab === t.value}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState
          title={tab === 'NEEDS_REVIEW' ? 'All caught up' : 'Nothing here yet'}
          hint={tab === 'NEEDS_REVIEW' ? 'New order messages will appear here to check.' : undefined}
        />
      )}
      {data && data.length > 0 && (
        <ul class="dinbox">
          {data.map((capture) => (
            <li key={capture.id}>
              <Link href={`/desk/inbox/${capture.id}`} class="dmsg">
                <span class="dmsg-main">
                  <span class="dmsg-shop">
                    {capture.retailer.shopName}
                    <span class="muted"> · {capture.retailer.area}</span>
                  </span>
                  <span class="dmsg-text">{capture.rawText}</span>
                  <span class="muted">{formatDateTime(capture.createdAt)}</span>
                </span>
                <span class="dmsg-side">
                  {capture.status === 'NEEDS_REVIEW' ? (
                    capture.needsDecision > 0 ? (
                      <span class="tag tag-warn">
                        {capture.needsDecision} of {capture.lineCount} to decide
                      </span>
                    ) : (
                      <span class="tag tag-accent">{capture.lineCount} lines look right</span>
                    )
                  ) : (
                    <span class="muted">{capture.orderLabel ?? 'Rejected'}</span>
                  )}
                  <ChevronIcon size={18} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
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
      {result.replyText && (
        <section>
          <p class="message-label">Reply sent on WhatsApp (simulated)</p>
          <blockquote class="message-bubble dreply">{result.replyText}</blockquote>
        </section>
      )}
      <div class="dnew-actions">
        <Link href="/desk/inbox" class="btn btn-primary">
          Next message
        </Link>
        <Link href={`/desk/orders/${result.order.id}`} class="btn btn-quiet">
          Open order
        </Link>
      </div>
    </div>
  );
}

function DecidedCapture({ capture }: { capture: CaptureDetail }) {
  const skuName = (id: string | null) => {
    const sku = capture.catalogue.skus.find((s) => s.id === id);
    return sku ? shortName(sku.name) : '';
  };

  return (
    <div class="dresult">
      <section class="message">
        <p class="message-label">Message from {capture.retailer.shopName}</p>
        <blockquote class="message-bubble">{capture.rawText}</blockquote>
      </section>
      <ul class="rows">
        {capture.lines.map((line) => (
          <li key={line.id} class="row">
            <span class="row-main">
              <q>{line.originalWords}</q>
              <span class="muted">
                {line.decision === 'DROPPED'
                  ? 'Left out'
                  : `${line.finalQuantity} ${line.finalUnit === 'CASE' ? 'cases' : 'pieces'} of ${skuName(line.finalSkuId)}`}
              </span>
            </span>
            {line.decision === 'CORRECTED' && <span class="tag tag-accent">Corrected</span>}
          </li>
        ))}
      </ul>
      {capture.replyText && (
        <section>
          <p class="message-label">Reply sent on WhatsApp (simulated)</p>
          <blockquote class="message-bubble dreply">{capture.replyText}</blockquote>
        </section>
      )}
      {capture.orderId && (
        <Link href={`/desk/orders/${capture.orderId}`} class="btn btn-quiet">
          Open {capture.orderLabel}
        </Link>
      )}
    </div>
  );
}

export function DeskCaptureScreen({ id }: { id: string }) {
  const [, navigate] = useLocation();
  const { data, error, loading, reload } = useAsync(
    () => api<CaptureDetail>(`/api/desk/captures/${id}`),
    [id],
  );
  const [result, setResult] = useState<ConfirmCaptureResult | null>(null);

  return (
    <>
      <header class="dhead">
        <div class="dhead-back">
          <Link href="/desk/inbox" class="icon-btn" aria-label="Back to messages">
            <BackIcon />
          </Link>
          <h1 class="dtitle">{data?.retailer.shopName ?? 'Message'}</h1>
        </div>
      </header>

      {loading && !data && <Loading />}
      {error && !data && <ErrorState message={error.message} onRetry={reload} />}
      {result && <ConfirmedPanel result={result} />}
      {!result && data && data.status !== 'NEEDS_REVIEW' && <DecidedCapture capture={data} />}
      {!result && data && data.status === 'NEEDS_REVIEW' && (
        <div class="dreview">
          <CaptureReview
            key={data.catalogue.asOf}
            capture={data}
            messageLabel={`WhatsApp from ${data.retailer.shopName}`}
            showEngine
            submit={(body: ConfirmCaptureBody) =>
              api<ConfirmCaptureResult>(`/api/desk/captures/${id}/confirm`, { body, timeoutMs: 30_000 })
            }
            discard={() => api(`/api/desk/captures/${id}/reject`, { method: 'POST' })}
            onConfirmed={(confirmed) => {
              setResult(confirmed);
              refreshCounts();
            }}
            onDiscarded={() => {
              refreshCounts();
              navigate('/desk/inbox');
            }}
            onStale={reload}
          />
        </div>
      )}
    </>
  );
}
