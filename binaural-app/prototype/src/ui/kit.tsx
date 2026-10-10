import { AnimatePresence, motion, useDragControls } from 'motion/react';
import { useEffect, useId, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { IconBack, IconClose } from './icons';

export const EASE = [0.22, 0.8, 0.3, 1] as const;

const cx = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(' ');
export { cx };

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'outline' | 'quiet' | 'text'; full?: boolean };

/** Buttons: 56 px primary (Fleece fill, Loden label); outline for Stop; quiet for secondary; text links. */
export function Button({ variant = 'primary', full, className, children, ...p }: BtnProps) {
  const v = {
    primary: 'btn-primary bg-ink text-onink h-14 rounded-[18px] px-6 text-[17px] font-bold',
    outline: 'border-[1.5px] border-ink/70 text-ink h-14 rounded-[18px] px-6 text-[17px] font-bold hover:bg-ink/5',
    quiet: 'bg-surface2 text-ink min-h-12 rounded-[14px] px-4 text-[16px] font-medium hover:bg-line/60',
    text: 'text-ink min-h-12 px-1 text-[16px] font-medium underline decoration-ink2/60 underline-offset-[5px] hover:decoration-ink',
  }[variant];
  return (
    <button
      type="button"
      {...p}
      className={cx('inline-flex items-center justify-center gap-2 leading-[22px] transition-colors duration-200 select-none disabled:opacity-45', v, full && 'w-full', className)}
    >
      {children}
    </button>
  );
}

/** A segmented control (Level, Drift / Hold, Noise colour). Arrow keys move between segments. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
  locked = [],
  lockedNote = 'unavailable',
  testid,
}: {
  value: T;
  options: { value: T; label: string; icon?: ReactNode }[];
  onChange: (v: T) => void;
  label: string;
  locked?: T[];
  /** Read out with a locked option, e.g. "unavailable, ceiling is Medium". */
  lockedNote?: string;
  testid?: string;
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const idx = options.findIndex((o) => o.value === value);
  const move = (d: number) => {
    let i = idx;
    for (let k = 0; k < options.length; k++) {
      i = (i + d + options.length) % options.length;
      if (!locked.includes(options[i]!.value)) break;
    }
    onChange(options[i]!.value);
    refs.current[i]?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label={label}
      data-testid={testid}
      className="flex h-12 w-full rounded-[14px] bg-bg/55 p-1 gap-1 border border-edge"
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
          e.preventDefault();
          e.stopPropagation();
          move(1);
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
          e.preventDefault();
          e.stopPropagation();
          move(-1);
        }
      }}
    >
      {options.map((o, i) => {
        const on = o.value === value;
        const isLocked = locked.includes(o.value);
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            aria-disabled={isLocked || undefined}
            tabIndex={on ? 0 : -1}
            data-testid={testid ? `${testid}-${o.value}` : undefined}
            onClick={() => !isLocked && onChange(o.value)}
            className={cx(
              'relative flex-1 min-w-0 rounded-[10px] text-[16px] font-medium inline-flex items-center justify-center gap-1.5 transition-colors duration-200',
              // Selected: a 2 px Fleece outline, so the state reads at 3:1 or better (WCAG 1.4.11), not by fill alone.
              on ? 'bg-surface2 text-ink font-bold shadow-[inset_0_0_0_2px_var(--c-ink)]' : 'text-ink2 hover:text-ink',
              isLocked && 'cursor-not-allowed text-ink2/70',
            )}
            style={
              isLocked
                ? { backgroundImage: 'repeating-linear-gradient(135deg, color-mix(in srgb, var(--c-ink2) 22%, transparent) 0 1px, transparent 1px 6px)' }
                : undefined
            }
          >
            {o.icon}
            <span className="truncate">{o.label}</span>
            {isLocked && <span className="sr-only">, {lockedNote}</span>}
          </button>
        );
      })}
    </div>
  );
}

/** A switch row: 56 px tall, label + optional hint, literal wording. */
export function SwitchRow({
  label,
  hint,
  checked,
  onChange,
  testid,
  disabled,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  testid?: string;
  disabled?: boolean;
}) {
  const id = useId();
  return (
    <div className="flex items-start gap-4 py-3 min-h-14">
      <div className="flex-1 min-w-0">
        <label htmlFor={id} className="block text-[16px] font-medium leading-[22px] text-ink pt-[3px]">
          {label}
        </label>
        {hint && <p className="text-[16px] leading-[22px] text-ink2 mt-1">{hint}</p>}
      </div>
      <button
        id={id}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        data-testid={testid}
        onClick={() => onChange(!checked)}
        className={cx(
          'relative mt-0 shrink-0 h-12 w-[60px] rounded-full transition-colors duration-200 flex items-center',
          'before:absolute before:inset-x-0 before:top-1/2 before:-translate-y-1/2 before:h-[30px] before:rounded-full before:transition-colors before:duration-200',
          checked ? 'before:bg-ink' : 'before:bg-line',
        )}
      >
        <span
          className={cx('relative z-[1] block h-6 w-6 rounded-full transition-transform duration-200 ease-[cubic-bezier(.22,.8,.3,1)]', checked ? 'translate-x-[33px] bg-onink' : 'translate-x-[3px] bg-ink2')}
        />
      </button>
    </div>
  );
}

export function Group({ title, children, note }: { title: string; children: ReactNode; note?: string }) {
  return (
    <section className="mt-8 first:mt-2" aria-label={title}>
      <h2 className="text-[16px] font-bold text-ink2 mb-1 px-1">{title}</h2>
      <div className="rounded-[18px] bg-surface px-4 divide-y divide-line">{children}</div>
      {note && <p className="text-[16px] leading-[22px] text-ink2 mt-2 px-1">{note}</p>}
    </section>
  );
}

export function RowButton({ label, value, onClick, testid, icon }: { label: string; value?: string; onClick: () => void; testid?: string; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} data-testid={testid} className="w-full flex items-center gap-3 min-h-14 py-3 text-left">
      {icon && <span className="text-ink2">{icon}</span>}
      <span className="flex-1 text-[16px] font-medium text-ink">{label}</span>
      {value && <span className="text-[16px] text-ink2 tnum">{value}</span>}
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" className="text-ink2" aria-hidden>
        <path d="M9 6l6 6-6 6" />
      </svg>
    </button>
  );
}

/** The running stitch: left half Heather, right half Lichen, a gap in the middle where the beat lives. */
export function Stitch({
  width = 240,
  left = 'on',
  right = 'on',
  mono = false,
  meet = false,
  reduced = false,
  stroke = 3,
  gap: gapProp,
  meetAmount = 0,
  glideMs,
}: {
  width?: number;
  left?: 'on' | 'dim' | 'lit';
  right?: 'on' | 'dim' | 'lit';
  mono?: boolean;
  meet?: boolean;
  reduced?: boolean;
  stroke?: number;
  /** Gap between the halves, px (default 18). The layer uses it to show the beat as a distance. */
  gap?: number;
  /** 0..1: how far the halves have closed (the pull-up ritual). */
  meetAmount?: number;
  /** Transition for gap changes (Drift glides over 60 s). */
  glideMs?: number;
}) {
  const half = width / 2;
  const base = gapProp ?? 18;
  const gap = meet ? 4 : base - (base - 4) * Math.max(0, Math.min(1, meetAmount));
  const dash = Math.max(8, width / 18);
  const op = (s: 'on' | 'dim' | 'lit') => (s === 'dim' ? 0.28 : s === 'lit' ? 1 : 0.62);
  const lc = mono ? 'var(--c-ink2)' : 'var(--c-left)';
  const rc = mono ? 'var(--c-ink2)' : 'var(--c-right)';
  const t = reduced ? '0ms' : meetAmount > 0 && !meet ? '0ms' : `${glideMs ?? 600}ms`;
  // Each half moves by half the change in gap from the drawn 18 px.
  const shift = (18 - gap) / 2;
  return (
    <svg width={width} height={stroke * 4} viewBox={`0 0 ${width} ${stroke * 4}`} aria-hidden className="block overflow-visible">
      <g style={{ transform: `translateX(${shift}px)`, transition: `transform ${t} cubic-bezier(.22,.8,.3,1)` }}>
        <line
          x1={stroke}
          x2={half - 9}
          y1={stroke * 2}
          y2={stroke * 2}
          stroke={lc}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${dash * 0.9}`}
          style={{ opacity: op(left), transition: 'opacity 300ms linear' }}
        />
      </g>
      <g style={{ transform: `translateX(${-shift}px)`, transition: `transform ${t} cubic-bezier(.22,.8,.3,1)` }}>
        <line
          x1={half + 9}
          x2={width - stroke}
          y1={stroke * 2}
          y2={stroke * 2}
          stroke={rc}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${dash} ${dash * 0.9}`}
          style={{ opacity: op(right), transition: 'opacity 300ms linear' }}
        />
      </g>
    </svg>
  );
}

/** The Tuck mark (docs/logo.svg), with the audio lines dropped below 40 px. */
export function Mark({ size = 64, plain = false }: { size?: number; plain?: boolean }) {
  const small = size < 40;
  const id = useId().replace(/:/g, '');
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" aria-hidden className="block shrink-0">
      <defs>
        <clipPath id={`t${id}`}>
          <rect width="96" height="96" rx="22" />
        </clipPath>
      </defs>
      <g clipPath={`url(#t${id})`}>
        <rect width="96" height="96" fill="#1C211C" />
        {!small && <path d="M26 22 H70 M34 31 H62" stroke="#AEB2A0" strokeWidth="4" strokeLinecap="round" opacity=".55" />}
        {plain ? (
          <>
            <path d="M0 48 Q48 40 96 48 V96 H0 Z" fill="none" stroke="#AEB2A0" strokeWidth="3" />
            <path d="M14 79 h8 M30 79 h8 M58 79 h8 M74 79 h8" stroke="#AEB2A0" strokeWidth="5" strokeLinecap="round" />
          </>
        ) : (
          <>
            <path d="M0 48 Q48 40 96 48 V96 H0 Z" fill="#ECE7DA" />
            <path d="M0 48 Q48 40 96 48 V56 Q48 68 0 56 Z" fill="#EBB89A" />
            <path d="M0 56 Q48 68 96 56" fill="none" stroke="#C99577" strokeWidth="1.5" />
            <path d="M14 79 h8 M30 79 h8" stroke="#43618F" strokeWidth="5" strokeLinecap="round" />
            <path d="M58 79 h8 M74 79 h8" stroke="#7D7A2E" strokeWidth="5" strokeLinecap="round" />
          </>
        )}
      </g>
      <rect x="0.75" y="0.75" width="94.5" height="94.5" rx="21.5" fill="none" stroke="#AEB2A0" strokeOpacity=".22" strokeWidth="1.5" />
    </svg>
  );
}

/** Bottom sheet: radius 28, grabber at the sheet's top, dismiss by swipe down, Close or Escape. */
export function Sheet({
  open,
  onClose,
  title,
  children,
  reduced,
  testid,
  tall,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  reduced: boolean;
  testid?: string;
  tall?: boolean;
}) {
  const controls = useDragControls();
  const ref = useRef<HTMLDivElement>(null);
  const titleId = useId();
  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    const t = setTimeout(() => ref.current?.focus(), 30);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => {
      clearTimeout(t);
      window.removeEventListener('keydown', onKey, true);
      prev?.focus?.();
    };
  }, [open, onClose]);
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="absolute inset-0 z-40 flex flex-col justify-end" initial={{ opacity: 1 }} exit={{ opacity: 1 }}>
          <motion.button
            type="button"
            aria-label="Close"
            tabIndex={-1}
            className="absolute inset-0 bg-[var(--c-scrim)] cursor-default"
            onClick={onClose}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28 }}
          />
          <motion.div
            ref={ref}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            data-testid={testid}
            className={cx(
              'relative rounded-t-[28px] bg-surface text-ink shadow-[var(--sheet-shadow)] flex flex-col outline-none',
              tall ? 'max-h-[88%]' : 'max-h-[80%]',
            )}
            initial={reduced ? { opacity: 0 } : { y: '100%' }}
            animate={reduced ? { opacity: 1 } : { y: 0 }}
            exit={reduced ? { opacity: 0 } : { y: '100%' }}
            transition={{ duration: reduced ? 0.6 : 0.28, ease: EASE }}
            drag={reduced ? false : 'y'}
            dragListener={false}
            dragControls={controls}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.6 }}
            onDragEnd={(_, info) => {
              if (info.offset.y > 90 || info.velocity.y > 600) onClose();
            }}
          >
            <div className="pt-2 pb-1 flex justify-center touch-none cursor-grab" onPointerDown={(e) => controls.start(e)}>
              <span className="block h-[5px] w-10 rounded-full bg-ink2/70" aria-hidden />
            </div>
            <div className="flex items-center justify-between px-5 pb-2">
              <h2 id={titleId} className="text-[20px] leading-7 font-bold">
                {title}
              </h2>
              <button type="button" onClick={onClose} className="h-12 w-12 -mr-2 inline-flex items-center justify-center rounded-full text-ink2 hover:text-ink" data-testid="sheet-close">
                <IconClose />
                <span className="sr-only">Close</span>
              </button>
            </div>
            <div className="overflow-y-auto scroll-soft px-5 pb-[calc(34px+16px)]">{children}</div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * A full page pushed over Home (Settings, What we know…). Slides in from the right, or cross-fades.
 * The header is opaque: once the page scrolls, the title moves into it with a hairline, so nothing
 * scrolls visibly under Back. An optional footer (the editor's Save) stays put.
 */
export function PageShell({
  title,
  onBack,
  children,
  reduced,
  testid,
  backLabel = 'Back',
  footer,
}: {
  title: string;
  onBack: () => void;
  children: ReactNode;
  reduced: boolean;
  testid?: string;
  backLabel?: string;
  footer?: ReactNode;
}) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onBack();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack]);
  return (
    <motion.div
      className="absolute inset-0 z-30 bg-bg flex flex-col"
      data-testid={testid}
      initial={reduced ? { opacity: 0 } : { x: '100%' }}
      animate={reduced ? { opacity: 1 } : { x: 0 }}
      exit={reduced ? { opacity: 0 } : { x: '100%' }}
      transition={{ duration: reduced ? 0.6 : 0.32, ease: EASE }}
    >
      <div className="h-[47px] shrink-0 bg-bg" />
      <header className={cx('relative h-14 shrink-0 flex items-center gap-1 px-2 bg-bg z-[2] border-b transition-colors duration-200', scrolled ? 'border-line' : 'border-transparent')}>
        <button type="button" onClick={onBack} className="h-12 min-w-12 inline-flex items-center gap-1 pr-3 pl-1 rounded-full text-ink relative z-[1]" data-testid="page-back">
          <IconBack />
          <span className="text-[16px] font-medium">{backLabel}</span>
        </button>
        <p
          className={cx('absolute inset-x-[110px] text-center text-[17px] font-bold text-ink truncate transition-opacity duration-200', scrolled ? 'opacity-100' : 'opacity-0')}
          aria-hidden
          data-testid="page-header-title"
        >
          {title}
        </p>
        <h1 className="sr-only">{title}</h1>
      </header>
      <div className="flex-1 overflow-y-auto scroll-soft px-5 pb-12" tabIndex={-1} onScroll={(e) => setScrolled((e.target as HTMLElement).scrollTop > 36)} data-testid="page-scroll">
        {children}
      </div>
      {footer && <div className="shrink-0 bg-surface border-t border-line px-5 pt-3 pb-[calc(34px+8px)]">{footer}</div>}
    </motion.div>
  );
}

/** Notice banner: Seam, an icon, one sentence, one fix. Never red. */
export function Banner({ icon, children, actions, testid }: { icon: ReactNode; children: ReactNode; actions?: ReactNode; testid?: string }) {
  return (
    <div role="status" data-testid={testid} className="rounded-[18px] bg-surface2 px-4 py-3 text-ink flex gap-3">
      <span className="text-ink2 mt-[1px] shrink-0">{icon}</span>
      <div className="flex-1 min-w-0">
        <p className="text-[16px] leading-[22px]">{children}</p>
        {actions && <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 -ml-1">{actions}</div>}
      </div>
    </div>
  );
}
