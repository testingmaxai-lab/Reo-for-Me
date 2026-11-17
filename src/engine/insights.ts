/** What the review history says about where the learner goes wrong. */
import type { Content } from '../content/types';
import { parseKey, type Skill } from './exercises';
import type { Verdict } from './normalize';
import type { ReviewLog } from './progress';
import { itemExists } from './session';
import { DAY } from './srs';

export type ErrorKind = 'macron' | 'typo' | 'order' | 'confusion' | 'blank' | 'other';
export const ERROR_LABEL: Record<ErrorKind, string> = {
  macron: 'Macrons', typo: 'Spelling slips', order: 'Word order', confusion: 'Mixing up words', blank: 'Could not recall', other: 'Other errors',
};
export const ERROR_TIP: Record<ErrorKind, string> = {
  macron: 'Say the word aloud and listen for the long vowel before you type it.',
  typo: 'Close each time. Slow down slightly on longer words.',
  order: 'You had the right words. Remember the action or description comes first, then who.',
  confusion: 'You answered with a different real word. The trouble list shows which pairs you mix up.',
  blank: 'These did not come to mind at all. Shorter, more frequent sessions help recall.',
  other: 'A mix of errors with no single cause.',
};

/** Classify one answer that was not fully correct. */
export function classifyError(verdict: Verdict, answer: string, wordOrder: boolean, isOtherKnownWord: boolean): ErrorKind {
  if (verdict === 'macron') return 'macron';
  if (verdict === 'typo') return 'typo';
  if (!answer.trim()) return 'blank';
  if (wordOrder) return 'order';
  return isOtherKnownWord ? 'confusion' : 'other';
}

const isMiss = (r: ReviewLog) => (r.grade === 'again' || r.grade === 'hard') && r.verdict !== 'skipped' && r.verdict !== 'stage';
const kindOf = (r: ReviewLog): ErrorKind => r.e ?? (r.verdict === 'macron' ? 'macron' : r.verdict === 'typo' ? 'typo' : 'other');

export type Focus = 'all' | 'recognise' | 'produce' | 'sentences' | 'deep';
export const FOCUS_LABEL: Record<Focus, string> = { all: 'Everything', recognise: 'Māori → English', produce: 'English → Māori', sentences: 'Sentences', deep: 'Whakataukī' };
/** Which learning records a focused review includes. topic narrows to one vocabulary topic. */
export function focusFilter(c: Content, focus: Focus, topic = ''): (key: string) => boolean {
  return (key) => {
    const { itemId, skill } = parseKey(key);
    if (topic && c.vocabById.get(itemId)?.topic !== topic) return false;
    if (focus === 'all') return true;
    if (focus === 'sentences') return itemId.startsWith('p:');
    if (focus === 'deep') return itemId.startsWith('d:');
    return itemId.startsWith('v:') && skill === focus;
  };
}

export interface Trouble { key: string; itemId: string; skill: Skill; label: string; expected: string; misses: number; last: number; wrote: string[] }
/** Items missed most in the recent past, with what the learner typed instead. */
export function troubleList(c: Content, reviews: ReviewLog[], now: number, opts: { days?: number; limit?: number; minMisses?: number } = {}): Trouble[] {
  const since = now - (opts.days ?? 30) * DAY;
  const by = new Map<string, Trouble>();
  for (const r of reviews) {
    if (r.t < since || !isMiss(r)) continue;
    const { itemId, skill } = parseKey(r.key);
    if (!itemExists(itemId, c)) continue;
    let t = by.get(r.key);
    if (!t) {
      const v = c.vocabById.get(itemId), p = c.patternById.get(itemId), d = c.deepById.get(itemId);
      t = { key: r.key, itemId, skill, label: v?.mi ?? p?.title ?? d?.title ?? itemId, expected: v ? (skill === 'produce' ? v.mi : v.en.slice(0, 2).join('; ')) : '', misses: 0, last: 0, wrote: [] };
      by.set(r.key, t);
    }
    t.misses++;
    t.last = Math.max(t.last, r.t);
    const a = r.a?.trim();
    if (a && !t.wrote.includes(a)) t.wrote.push(a);
  }
  return [...by.values()]
    .filter((t) => t.misses >= (opts.minMisses ?? 2))
    .map((t) => ({ ...t, wrote: t.wrote.slice(-3) }))
    .sort((a, b) => b.misses - a.misses || b.last - a.last)
    .slice(0, opts.limit ?? 10);
}

export interface MistakeSummary {
  answers: number;
  misses: number;
  kinds: { kind: ErrorKind; count: number }[];
  skills: { group: 'recognise' | 'produce' | 'sentences'; total: number; right: number }[];
}
/** Error types and accuracy by kind of task over recent history. Self-rated answers are left out of error types. */
export function mistakeSummary(reviews: ReviewLog[], now: number, days = 30): MistakeSummary {
  const recent = reviews.filter((r) => r.t >= now - days * DAY && r.verdict !== 'skipped' && r.verdict !== 'stage' && r.verdict !== 'diagnostic');
  const kinds = new Map<ErrorKind, number>();
  const skills = new Map<string, { total: number; right: number }>();
  let misses = 0;
  for (const r of recent) {
    const { itemId, skill } = parseKey(r.key);
    const group = itemId.startsWith('p:') ? 'sentences' : itemId.startsWith('v:') && (skill === 'recognise' || skill === 'produce') ? skill : null;
    if (group) {
      const g = skills.get(group) ?? { total: 0, right: 0 };
      g.total++;
      if (r.grade === 'good' || r.grade === 'easy') g.right++;
      skills.set(group, g);
    }
    if (isMiss(r) && r.verdict !== 'self') { misses++; kinds.set(kindOf(r), (kinds.get(kindOf(r)) ?? 0) + 1); }
  }
  return {
    answers: recent.length, misses,
    kinds: [...kinds].map(([kind, count]) => ({ kind, count })).sort((a, b) => b.count - a.count),
    skills: (['recognise', 'produce', 'sentences'] as const).filter((g) => skills.has(g)).map((g) => ({ group: g, ...skills.get(g)! })),
  };
}
