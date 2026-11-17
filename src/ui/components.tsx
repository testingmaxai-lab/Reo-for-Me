import { useRef, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { STATUS_HELP, STATUS_LABEL, type Lang, type Status } from '../content/types';
import type { Buckets } from '../engine/progress';
import type { Strength } from '../engine/srs';

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' | 'inverse' | 'onAccent'; full?: boolean };
export function Button({ variant = 'primary', full, className = '', ...rest }: BtnProps) {
  const styles = {
    primary: 'bg-accent text-on-accent',
    secondary: 'bg-surface text-ink border border-line',
    ghost: 'text-accent',
    danger: 'bg-surface text-bad border border-bad',
    inverse: 'bg-surface text-accent',
    onAccent: 'text-on-hero border border-on-hero/40',
  }[variant];
  return <button type="button" {...rest} className={`min-h-12 rounded-xl px-4 text-base font-semibold disabled:opacity-40 active:opacity-80 ${styles} ${full ? 'w-full' : ''} ${className}`} />;
}

export const Card = ({ children, className = '' }: { children: ReactNode; className?: string }) => (
  <section className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>{children}</section>
);
export const H1 = ({ children }: { children: ReactNode }) => <h1 className="mb-4 text-2xl font-bold tracking-tight">{children}</h1>;
export const H2 = ({ children }: { children: ReactNode }) => <h2 className="mb-2 mt-6 text-sm font-semibold uppercase tracking-wide text-muted">{children}</h2>;
export const Muted = ({ children, className = '' }: { children: ReactNode; className?: string }) => <p className={`text-sm leading-relaxed text-muted ${className}`}>{children}</p>;
export const Reo = ({ children, className = '' }: { children: ReactNode; className?: string }) => <span lang="mi" className={`reo ${className}`}>{children}</span>;

export function Row({ title, sub, right, onClick, lang }: { title: ReactNode; sub?: ReactNode; right?: ReactNode; onClick?: () => void; lang?: Lang }) {
  const inner = (
    <>
      <span className="min-w-0 flex-1">
        <span lang={lang} className="block font-medium">{title}</span>
        {sub && <span className="block text-sm text-muted">{sub}</span>}
      </span>
      {right}
      {onClick && <span aria-hidden className="text-muted">›</span>}
    </>
  );
  const cls = 'flex min-h-14 w-full items-center gap-3 border-b border-line px-4 py-2 text-left last:border-b-0';
  return onClick ? <button type="button" onClick={onClick} className={cls}>{inner}</button> : <div className={cls}>{inner}</div>;
}
export const List = ({ children }: { children: ReactNode }) => <div className="overflow-hidden rounded-2xl border border-line bg-surface">{children}</div>;

export function StatusBadge({ status, source }: { status: Status; source?: string }) {
  const tone = status === 'verified' ? 'bg-good-soft text-good' : status === 'cross-checked' ? 'bg-accent-soft text-accent' : 'bg-warn-soft text-warn';
  return (
    <details className="text-sm">
      <summary className={`inline-block cursor-pointer list-none rounded-full px-2.5 py-1 text-xs font-semibold ${tone}`}>{STATUS_LABEL[status]} ⓘ</summary>
      <p className="mt-2 text-muted">{STATUS_HELP[status]}</p>
      {source && <p className="mt-1 text-muted">Source: {source}</p>}
    </details>
  );
}

const DOT: Record<Strength, string> = { new: 'bg-line', learning: 'bg-warn', familiar: 'bg-accent opacity-60', strong: 'bg-accent' };
export const STRENGTH_LABEL: Record<Strength, string> = { new: 'Not started', learning: 'Learning', familiar: 'Familiar', strong: 'Strong' };
export const Dot = ({ s }: { s: Strength }) => <span title={STRENGTH_LABEL[s]} aria-label={STRENGTH_LABEL[s]} className={`inline-block h-2.5 w-2.5 rounded-full ${DOT[s]}`} />;

export function BucketBar({ label, b }: { label: string; b: Buckets }) {
  const seg = (n: number, cls: string) => (n ? <span className={cls} style={{ width: `${(n / b.total) * 100}%` }} /> : null);
  return (
    <div className="py-2">
      <div className="mb-1 flex justify-between text-sm"><span className="font-medium">{label}</span><span className="text-muted">{b.total - b.new} of {b.total} started</span></div>
      <div className="flex h-2.5 overflow-hidden rounded-full bg-line" role="img" aria-label={`${label}: ${b.strong} strong, ${b.familiar} familiar, ${b.learning} learning, ${b.new} not started`}>
        {seg(b.strong, 'bg-accent')}{seg(b.familiar, 'bg-accent opacity-60')}{seg(b.learning, 'bg-warn')}
      </div>
      <div className="mt-1 text-xs text-muted">{b.strong} strong · {b.familiar} familiar · {b.learning} learning</div>
    </div>
  );
}

/** Text field with a macron key row for Māori answers. The buttons keep the keyboard open. */
export function AnswerInput({ value, onChange, lang, long, readOnly, placeholder, label = 'Your answer', autoFocus = true }: { value: string; onChange: (v: string) => void; lang: Lang; long?: boolean; readOnly?: boolean; placeholder?: string; label?: string; autoFocus?: boolean }) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  const insert = (ch: string) => {
    const el = ref.current;
    if (!el || readOnly) return;
    const s = el.selectionStart ?? value.length, e = el.selectionEnd ?? value.length;
    onChange(value.slice(0, s) + ch + value.slice(e));
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(s + 1, s + 1); });
  };
  const common = {
    ref, value, readOnly, lang, placeholder, autoFocus, 'aria-label': label,
    autoCapitalize: 'none', autoCorrect: 'off', autoComplete: 'off', spellCheck: false, enterKeyHint: 'go' as const,
    onChange: (e: { target: { value: string } }) => onChange(e.target.value),
    className: 'w-full rounded-xl border border-line bg-surface px-4 py-3 text-lg outline-none focus:border-accent',
  };
  return (
    <div>
      {long
        ? <textarea {...common} rows={4} onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); e.currentTarget.form?.requestSubmit(); } }} />
        : <input {...common} type="text" />}
      {lang === 'mi' && !readOnly && (
        <div className="mt-2 flex gap-2" role="group" aria-label="Macron vowels">
          {['ā', 'ē', 'ī', 'ō', 'ū'].map((ch) => (
            <button key={ch} type="button" tabIndex={-1} aria-label={`Insert ${ch}`} onPointerDown={(e) => { e.preventDefault(); insert(ch); }}
              className="h-11 flex-1 rounded-lg border border-line bg-surface text-lg font-medium active:bg-accent-soft">{ch}</button>
          ))}
        </div>
      )}
    </div>
  );
}

/** Small bar chart. Values are also given in the accessible label, so it is not colour- or sight-dependent. */
export function Bars({ values, labels, title, emphasise }: { values: number[]; labels: string[]; title: string; emphasise?: number }) {
  const max = Math.max(1, ...values);
  return (
    <div role="img" aria-label={`${title}: ${values.map((v, i) => `${labels[i]} ${v}`).join(', ')}`}>
      <div className="flex h-24 items-end gap-1.5">
        {values.map((v, i) => (
          <div key={i} className="flex h-full flex-1 flex-col items-center justify-end">
            {v > 0 && <span className="mb-0.5 text-[11px] tabular-nums text-muted">{v}</span>}
            <span className={`w-full rounded-t ${v ? (i === emphasise ? 'bg-accent' : 'bg-accent opacity-50') : 'bg-line'}`} style={{ height: v ? `${Math.max(6, (v / max) * 70)}%` : 2 }} />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-1.5">{labels.map((l, i) => <span key={i} className={`flex-1 text-center text-[11px] ${i === emphasise ? 'font-semibold text-ink' : 'text-muted'}`}>{l}</span>)}</div>
    </div>
  );
}

export function Segmented<T extends string | number>({ label, value, options, onChange }: { label: string; value: T; options: { value: T; label: string }[]; onChange: (v: T) => void }) {
  return (
    <div className="grid gap-2" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }} role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <button key={String(o.value)} type="button" role="radio" aria-checked={value === o.value} onClick={() => onChange(o.value)}
          className={`min-h-11 rounded-xl border text-sm font-semibold ${value === o.value ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface'}`}>{o.label}</button>
      ))}
    </div>
  );
}
