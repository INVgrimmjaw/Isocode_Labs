import { createStore } from '../lib/store.ts';

const message = createStore<string | null>(null);
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string) {
  message.set(text);
  clearTimeout(timer);
  timer = setTimeout(() => message.set(null), 4500);
}

export function ToastHost() {
  const text = message.use();
  if (!text) return null;
  return (
    <div class="toast" role="status">
      {text}
    </div>
  );
}
