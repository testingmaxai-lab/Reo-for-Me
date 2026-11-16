/** Deep-learning modules (whakataukī, karakia, pepeha): text resolution, stage exercises, mastery. */
import type { DeepItem, Pair } from '../content/types';
import { normMi } from './normalize';
import { strength, type Card } from './srs';

export const DEEP_STAGES = ['Encounter', 'Understand', 'Reconstruct', 'Full recall', 'Long-term mastery'] as const;
export const DEEP_DIMENSIONS = ['recall', 'meaning', 'structure', 'context'] as const;
export type DeepDimension = (typeof DEEP_DIMENSIONS)[number];
export const DIMENSION_LABEL: Record<DeepDimension, string> = {
  recall: 'Wording and recall', meaning: 'Meaning', structure: 'Language structure', context: 'Context and use',
};

export interface Resolved { lines: Pair[]; text: string; ready: boolean; missing: string[] }

/** Fill {slots} with the learner's own details. Lines with an empty optional slot are dropped. */
export function resolveDeep(item: DeepItem, values: Record<string, string> = {}): Resolved {
  const slots = new Map((item.slots ?? []).map((s) => [s.id, s]));
  const missing: string[] = [];
  const lines: Pair[] = [];
  for (const line of item.lines) {
    let drop = false;
    const fill = (s: string) => s.replace(/\{(\w+)\}/g, (_, id: string) => {
      const v = (values[id] ?? '').trim();
      if (!v) { if (slots.get(id)?.optional) drop = true; else if (!missing.includes(id)) missing.push(id); return '…'; }
      return v;
    });
    const mi = fill(line.mi), en = fill(line.en);
    if (!drop) lines.push({ mi, en });
  }
  return { lines, text: lines.map((l) => l.mi).join(' '), ready: missing.length === 0, missing };
}

export type Rng = () => number;
export function seeded(seed: number): Rng {
  let s = seed >>> 0 || 1;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
}
export function shuffle<T>(arr: T[], rng: Rng): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

export interface Cloze { display: string; answer: string; en: string }
const clean = (w: string) => w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');

/** Missing-word exercises. Only words from the fixed text are blanked, never the learner's own details. */
export function makeClozes(item: DeepItem, values: Record<string, string>, count: number, rng: Rng): Cloze[] {
  const candidates: { line: number; word: number }[] = [];
  const kept: { tpl: string[]; pair: Pair }[] = [];
  for (const line of item.lines) {
    const r = resolveDeep({ ...item, lines: [line] }, values);
    if (!r.lines.length) continue;
    const tpl = line.mi.split(/\s+/);
    kept.push({ tpl, pair: r.lines[0] });
    tpl.forEach((w, i) => { if (!w.includes('{') && clean(w)) candidates.push({ line: kept.length - 1, word: i }); });
  }
  return shuffle(candidates, rng).slice(0, count).map(({ line, word }) => {
    const { tpl, pair } = kept[line];
    const answer = clean(tpl[word]);
    const filled = resolveDeep({ ...item, lines: [{ mi: tpl.map((w, i) => (i === word ? w.replace(answer, '_____') : w)).join(' '), en: '' }] }, values);
    return { display: filled.lines[0]?.mi ?? '', answer, en: pair.en };
  });
}

/** Tiles for the ordering exercise: whole lines for longer texts, otherwise words. */
export function orderTiles(resolved: Resolved): string[] {
  if (resolved.lines.length >= 4) return resolved.lines.map((l) => l.mi);
  // words only: capitals and punctuation would give the order away
  return resolved.text.toLowerCase().split(/\s+/).map(clean).filter(Boolean);
}

export type DimensionLevel = 'not started' | 'learning' | 'developing' | 'strong';
export function dimensionLevel(c: Card | undefined): DimensionLevel {
  const s = strength(c);
  return s === 'new' ? 'not started' : s === 'familiar' ? 'developing' : s;
}
const RANK: DimensionLevel[] = ['not started', 'learning', 'developing', 'strong'];

/**
 * Mastery is reported per dimension. The overall level is the weakest dimension,
 * so knowing the words by heart never reads as mastery on its own.
 */
export function deepMastery(itemId: string, cards: Record<string, Card>) {
  const dimensions = Object.fromEntries(DEEP_DIMENSIONS.map((d) => [d, dimensionLevel(cards[`${itemId}|${d}`])])) as Record<DeepDimension, DimensionLevel>;
  const overall = RANK[Math.min(...DEEP_DIMENSIONS.map((d) => RANK.indexOf(dimensions[d])))];
  return { dimensions, overall };
}

export const sameText = (a: string, b: string, eq: Record<string, string> = {}) => normMi(a, eq) === normMi(b, eq);
