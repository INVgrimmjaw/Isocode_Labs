import type { ComponentChildren } from 'preact';
import { useT } from '../lib/i18n.ts';
import { AlertIcon } from './icons.tsx';

export function Loading({ label }: { label?: string }) {
  return (
    <div class="state" role="status">
      <span class="spinner" aria-hidden="true" />
      {label && <p class="state-hint">{label}</p>}
    </div>
  );
}

export function EmptyState({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="state">
      <h2 class="state-title">{title}</h2>
      {hint && <p class="state-hint">{hint}</p>}
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  const t = useT();
  return (
    <div class="state" role="alert">
      <span class="state-icon">
        <AlertIcon size={28} />
      </span>
      <p class="state-hint">{message}</p>
      {onRetry && (
        <button type="button" class="btn btn-quiet" onClick={onRetry}>
          {t('retry')}
        </button>
      )}
    </div>
  );
}
