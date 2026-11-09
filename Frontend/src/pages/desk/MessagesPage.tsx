import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import { createCapture, listCaptures, listRetailers } from '../../api/desk.ts';
import { formatDateTime } from '../../components/format.ts';
import { ChevronIcon } from '../../components/icons.tsx';
import { EmptyState, ErrorState, Loading } from '../../components/states.tsx';
import { useAsync } from '../../components/useAsync.ts';

function NewMessage({ onCreated }: { onCreated: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [retailerId, setRetailerId] = useState('');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retailers = useAsync(listRetailers, []);

  async function submit(event: Event) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated((await createCapture(retailerId, text)).id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong.');
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
      <p class="muted">WhatsApp is simulated. Paste a message as if it had arrived from a shop.</p>
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

export function MessagesPage() {
  const [, navigate] = useLocation();
  const { data, error, loading, reload } = useAsync(listCaptures, []);

  return (
    <>
      <header class="dhead">
        <h1 class="dtitle">Messages to check</h1>
        <NewMessage onCreated={(id) => navigate(`/desk/messages/${id}`)} />
      </header>

      {loading && !data && <Loading />}
      {error && <ErrorState message={error.message} onRetry={reload} />}
      {data && data.length === 0 && (
        <EmptyState title="All caught up" hint="New order messages will appear here to check." />
      )}
      {data && data.length > 0 && (
        <ul class="dinbox">
          {data.map((capture) => (
            <li key={capture.id}>
              <Link href={`/desk/messages/${capture.id}`} class="dmsg">
                <span class="dmsg-main">
                  <span class="dmsg-shop">
                    {capture.retailer.shopName}
                    <span class="muted"> · {capture.retailer.area}</span>
                  </span>
                  <span class="dmsg-text">{capture.rawText}</span>
                  <span class="muted">{formatDateTime(capture.createdAt)}</span>
                </span>
                <span class="dmsg-side">
                  {capture.needsDecision > 0 ? (
                    <span class="tag tag-warn">
                      {capture.needsDecision} of {capture.lineCount} to decide
                    </span>
                  ) : (
                    <span class="tag tag-accent">{capture.lineCount} lines look right</span>
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
