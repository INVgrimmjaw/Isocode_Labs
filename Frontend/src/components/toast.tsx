import { useEffect, useState } from 'preact/hooks';

let show: (text: string) => void = () => {};
let timer: ReturnType<typeof setTimeout> | undefined;

export function showToast(text: string) {
  show(text);
}

export function ToastHost() {
  const [text, setText] = useState<string | null>(null);

  useEffect(() => {
    show = (next) => {
      setText(next);
      clearTimeout(timer);
      timer = setTimeout(() => setText(null), 4500);
    };
  }, []);

  if (!text) return null;
  return (
    <div class="toast" role="status">
      {text}
    </div>
  );
}
