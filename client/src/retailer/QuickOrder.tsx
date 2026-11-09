import { useState } from 'preact/hooks';
import { Link, useLocation } from 'wouter-preact';
import type { CaptureDetail, ConfirmCaptureBody, ConfirmCaptureResult } from '#shared/api';
import { CaptureReview } from '../components/CaptureReview.tsx';
import { BackIcon } from '../components/icons.tsx';
import { ErrorState, Loading } from '../components/states.tsx';
import { api, errorMessage } from '../lib/api.ts';
import { useAsync } from '../lib/hooks.ts';
import { useT } from '../lib/i18n.ts';
import { refreshHome } from './home.ts';

const READ_TIMEOUT_MS = 45_000;

export function QuickOrderScreen() {
  const t = useT();
  const [, navigate] = useLocation();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function read(event: Event) {
    event.preventDefault();
    if (text.trim().length < 2) {
      setError(t('quick.tooShort'));
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const capture = await api<CaptureDetail>('/api/retailer/captures', {
        body: { text },
        timeoutMs: READ_TIMEOUT_MS,
      });
      navigate(`/quick/${capture.id}`);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  }

  return (
    <>
      <header class="bar">
        <h1 class="bar-title bar-title-lead">{t('quick.title')}</h1>
      </header>
      <main class="page">
        <form class="stack" onSubmit={read}>
          <p class="muted">{t('quick.hint')}</p>
          <textarea
            class="input textarea"
            rows={6}
            maxLength={2000}
            placeholder={t('quick.placeholder')}
            aria-label={t('quick.title')}
            value={text}
            disabled={busy}
            onInput={(e) => setText(e.currentTarget.value)}
          />
          {error && (
            <p class="notice notice-danger" role="alert">
              {error}
            </p>
          )}
          <button class="btn btn-primary btn-block" disabled={busy}>
            {busy ? t('quick.reading') : t('quick.read')}
          </button>
        </form>
      </main>
    </>
  );
}

export function CaptureReviewScreen({ id }: { id: string }) {
  const t = useT();
  const [, navigate] = useLocation();
  const { data, error, loading, reload } = useAsync(
    () => api<CaptureDetail>(`/api/retailer/captures/${id}`),
    [id],
  );

  return (
    <>
      <header class="bar">
        <Link href="/quick" class="icon-btn" aria-label={t('back')}>
          <BackIcon />
        </Link>
        <h1 class="bar-title">{t('review.title')}</h1>
      </header>
      <main class="page page-with-footer">
        {loading && !data && <Loading />}
        {error && !data && <ErrorState message={error.message} onRetry={reload} />}
        {data && (
          <CaptureReview
            key={data.catalogue.asOf}
            capture={data}
            messageLabel={t('review.yourMessage')}
            submit={(body: ConfirmCaptureBody) =>
              api<ConfirmCaptureResult>(`/api/retailer/captures/${id}/confirm`, { body, timeoutMs: 30_000 })
            }
            discard={() => api(`/api/retailer/captures/${id}/discard`, { method: 'POST' })}
            onConfirmed={(result) => {
              void refreshHome();
              navigate(`/orders/${result.order.id}?placed=1`, { replace: true });
            }}
            onDiscarded={() => navigate('/', { replace: true })}
            onStale={reload}
          />
        )}
      </main>
    </>
  );
}
