import { MinusIcon, PlusIcon } from './icons.tsx';

const MAX_QUANTITY = 5000;

export function Stepper({
  value,
  onChange,
  max = MAX_QUANTITY,
  label,
}: {
  value: number;
  onChange: (next: number) => void;
  max?: number;
  label: string;
}) {
  const limit = Math.min(max, MAX_QUANTITY);
  return (
    <div class="stepper" role="group" aria-label={label}>
      <button
        type="button"
        class="stepper-btn"
        aria-label={`${label} −`}
        disabled={value <= 0}
        onClick={() => onChange(Math.max(0, value - 1))}
      >
        <MinusIcon size={20} />
      </button>
      {/* Typing beats tapping + twenty-five times. */}
      <input
        class="stepper-value"
        inputMode="numeric"
        pattern="[0-9]*"
        aria-label={label}
        value={value}
        onFocus={(e) => e.currentTarget.select()}
        onInput={(e) => {
          const digits = e.currentTarget.value.replace(/\D/g, '');
          onChange(Math.min(limit, digits === '' ? 0 : Number(digits)));
        }}
      />
      <button
        type="button"
        class="stepper-btn"
        aria-label={`${label} +`}
        disabled={value >= limit}
        onClick={() => onChange(value + 1)}
      >
        <PlusIcon size={20} />
      </button>
    </div>
  );
}
