import type { ComponentChildren } from 'preact';
import { AlertIcon } from './icons.tsx';

export function Loading() {
  return (
    <div class="state" role="status">
      <span class="spinner" aria-hidden="true" />
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

export function ErrorState({
  message,
  onRetry,
  retryLabel = 'Try again',
}: {
  message: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <div class="state" role="alert">
      <span class="state-icon">
        <AlertIcon size={28} />
      </span>
      <p class="state-hint">{message}</p>
      {onRetry && (
        <button type="button" class="btn btn-quiet" onClick={onRetry}>
          {retryLabel}
        </button>
      )}
    </div>
  );
}
