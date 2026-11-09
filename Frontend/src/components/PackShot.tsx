import type { JSX } from 'preact';

/** Product art drawn in code, because the brief supplies no photographs. It costs no network requests on 3G. */

const BRAND_TINTS: Record<string, { body: string; band: string; soft: string }> = {
  Aarohi: { body: '#E9A23B', band: '#B5651D', soft: '#FBE8C8' },
  Meher: { body: '#3F8F6B', band: '#1F5C44', soft: '#D5EBDF' },
  Kanti: { body: '#4C7FC4', band: '#274E86', soft: '#D8E5F5' },
  Vasant: { body: '#CF6A7E', band: '#8E3A4E', soft: '#F6DBE1' },
};

const FALLBACK_TINT = { body: '#9AA0A8', band: '#5F656E', soft: '#E7E8EA' };

type Tint = typeof FALLBACK_TINT;

function Biscuit({ t }: { t: Tint }) {
  return (
    <>
      <path d="M12 38l4-3 4 3 4-3v50l-4-3-4 3-4-3zM96 35l4 3 4-3 4 3v44l-4 3-4-3-4 3z" fill={t.band} />
      <rect x="22" y="35" width="76" height="50" rx="3" fill={t.body} />
      <rect x="44" y="35" width="32" height="50" fill={t.band} />
      <circle cx="60" cy="60" r="15" fill={t.soft} />
      <g fill={t.body}>
        <circle cx="55" cy="55" r="1.8" />
        <circle cx="65" cy="55" r="1.8" />
        <circle cx="60" cy="61" r="1.8" />
        <circle cx="55" cy="66" r="1.8" />
        <circle cx="65" cy="66" r="1.8" />
      </g>
    </>
  );
}

function Pouch({ t }: { t: Tint }) {
  return (
    <>
      <path d="M34 16h52l7 84a6 6 0 0 1-6 7H33a6 6 0 0 1-6-7z" fill={t.body} />
      <path d="M34 16h52l1 12H33z" fill={t.band} />
      <circle cx="60" cy="66" r="21" fill={t.soft} />
      <g fill={t.body}>
        <circle cx="53" cy="61" r="6" />
        <circle cx="66" cy="58" r="4" />
        <circle cx="65" cy="72" r="7" />
      </g>
    </>
  );
}

function Box({ t }: { t: Tint }) {
  return (
    <>
      <path d="M36 20h48v82H36z" fill={t.body} />
      <path d="M84 20l10-6v82l-10 6z" fill={t.band} />
      <path d="M36 20l10-6h48l-10 6z" fill={t.soft} />
      <path d="M60 44c13 2 18 12 16 26-14 1-24-10-16-26z" fill={t.soft} />
      <path d="M61 47c4 8 9 15 14 22" stroke={t.band} stroke-width="1.6" fill="none" />
      <rect x="36" y="84" width="48" height="10" fill={t.band} />
    </>
  );
}

function Pillow({ t }: { t: Tint }) {
  return (
    <>
      <path d="M30 22h60c-5 12-5 64 0 76H30c5-12 5-64 0-76z" fill={t.body} />
      <path d="M30 22h60l-2 8H32zM32 90h56l2 8H30z" fill={t.band} />
      <ellipse cx="60" cy="60" rx="20" ry="24" fill={t.soft} />
      <g fill={t.band}>
        <path d="M51 48l11-4 2 11z" />
        <path d="M60 62l11-3-2 11z" />
        <path d="M49 66l9 1-4 9z" />
      </g>
    </>
  );
}

function Bar({ t }: { t: Tint }) {
  return (
    <>
      <rect x="16" y="38" width="88" height="46" rx="12" fill={t.band} />
      <rect x="16" y="33" width="88" height="46" rx="12" fill={t.body} />
      <ellipse cx="60" cy="56" rx="28" ry="15" fill={t.soft} />
      <ellipse cx="60" cy="56" rx="18" ry="8" fill={t.body} />
    </>
  );
}

function Bottle({ t }: { t: Tint }) {
  return (
    <>
      <rect x="49" y="10" width="22" height="16" rx="3" fill={t.band} />
      <path d="M50 26h20c0 8 16 12 16 30v44a8 8 0 0 1-8 8H42a8 8 0 0 1-8-8V56c0-18 16-22 16-30z" fill={t.body} />
      <rect x="34" y="58" width="52" height="34" fill={t.soft} />
      <path d="M60 64c7 9 10 12 10 17a10 10 0 0 1-20 0c0-5 3-8 10-17z" fill={t.body} />
    </>
  );
}

const SHAPES: Record<string, (props: { t: Tint }) => JSX.Element> = {
  biscuit: Biscuit,
  pouch: Pouch,
  box: Box,
  pillow: Pillow,
  bar: Bar,
  bottle: Bottle,
};

export function PackShot({ kind, brand }: { kind: string; brand: string }) {
  const Shape = SHAPES[kind] ?? Box;
  return (
    <svg class="pack" viewBox="0 0 120 120" aria-hidden="true">
      <Shape t={BRAND_TINTS[brand] ?? FALLBACK_TINT} />
    </svg>
  );
}
