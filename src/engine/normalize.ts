/** Answer normalisation and validation. Pure functions, no AI, no network. */
import type { Lang } from '../content/types';

const MACRON: Record<string, string> = { ā: 'a', ē: 'e', ī: 'i', ō: 'o', ū: 'u' };
export const stripMacrons = (s: string) => s.replace(/[āēīōū]/g, (c) => MACRON[c]);
/** ā -> aa: the older double-vowel spelling, accepted as equivalent to a macron. */
export const doubleVowels = (s: string) => s.replace(/[āēīōū]/g, (c) => MACRON[c] + MACRON[c]);

function base(s: string): string {
  return s
    .normalize('NFC')
    .toLowerCase()
    .replace(/[’‘`´]/g, "'")
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[.,!?;:"“”…\-–—/]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function normMi(s: string, equivalents: Record<string, string> = {}): string {
  return base(s)
    .replace(/'/g, '')
    .split(' ')
    .map((t) => equivalents[t] ?? t)
    .join(' ');
}

const CONTRACTIONS: [RegExp, string][] = [
  [/\bwon't\b/g, 'will not'], [/\bcan't\b/g, 'cannot'], [/\bcan not\b/g, 'cannot'], [/n't\b/g, ' not'],
  [/\bi'm\b/g, 'i am'], [/\blet's\b/g, 'let us'], [/'re\b/g, ' are'], [/'ll\b/g, ' will'], [/'ve\b/g, ' have'],
  [/\b(it|he|she|that|what|where|who|there|this)'s\b/g, '$1 is'],
];
export function normEn(s: string): string {
  let t = base(s);
  for (const [re, to] of CONTRACTIONS) t = t.replace(re, to);
  return t.replace(/'/g, '').replace(/\s+/g, ' ').trim();
}
/** For single-word meanings: "to eat" / "a dog" / "the dog" are the same answer as "eat" / "dog". */
export const normEnLoose = (s: string) => normEn(s).replace(/^(to|a|an|the) /, '');

/**
 * Expand authoring shorthand: "(She|He) is (talking|speaking)" -> 4 strings.
 * Brackets without a "|" are clarifiers and are left alone.
 */
export function expandAlternatives(s: string): string[] {
  const m = /\(([^()]*\|[^()]*)\)/.exec(s);
  if (!m) return [s.replace(/\s+/g, ' ').trim()];
  const out: string[] = [];
  for (const opt of m[1].split('|')) {
    out.push(...expandAlternatives(s.slice(0, m.index) + opt + s.slice(m.index + m[0].length)));
  }
  return out;
}

/** Damerau–Levenshtein distance (adjacent transpositions count as one edit). */
export function editDistance(a: string, b: string): number {
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  return d[a.length][b.length];
}

export type Verdict = 'correct' | 'alternative' | 'macron' | 'typo' | 'wrong';
export interface CheckResult {
  verdict: Verdict;
  /** the main expected answer, for display */
  expected: string;
  /** other accepted answers, for display */
  alternatives: string[];
  /** short explanation of what was wrong, when we can say something reliable */
  note?: string;
}
export interface CheckOptions {
  equivalents?: Record<string, string>;
  /** known Māori words: a "typo" that is itself a real word is treated as a real error */
  lexicon?: Set<string>;
  /** single-word English meanings: ignore leading to/a/the */
  looseEn?: boolean;
}

/** One-letter slips are only forgiven in longer words; short Māori words differ by one letter too often. */
function tokensAreTypo(input: string[], expected: string[], lang: Lang, lexicon?: Set<string>): boolean {
  if (input.length !== expected.length) return false;
  let slips = 0;
  for (let i = 0; i < input.length; i++) {
    if (input[i] === expected[i]) continue;
    const a = stripMacrons(input[i]);
    const b = stripMacrons(expected[i]);
    if (a === b) continue; // macron-only difference on this word
    if (b.length < 5) return false;
    if (a === b + 's' || b === a + 's') return false; // singular vs plural is a real difference
    if (lang === 'mi' && lexicon?.has(input[i])) return false;
    if (editDistance(a, b) > (b.length >= 10 ? 2 : 1)) return false;
    slips++;
  }
  return slips > 0 && slips <= 2;
}

export function checkAnswer(input: string, answers: string[], lang: Lang, opts: CheckOptions = {}): CheckResult {
  const display = answers.flatMap(expandAlternatives);
  const norm = lang === 'mi' ? (s: string) => normMi(s, opts.equivalents) : opts.looseEn ? normEnLoose : normEn;
  const expected = display[0] ?? '';
  const seen = new Set<string>([norm(expected)]);
  const alternatives = display.slice(1).filter((d) => { const n = norm(d); if (seen.has(n)) return false; seen.add(n); return true; });
  const result = (verdict: Verdict, note?: string): CheckResult => ({ verdict, expected, alternatives, note });

  const n = norm(input);
  if (!n) return result('wrong');
  const normed = display.map(norm);

  const exact = normed.indexOf(n);
  if (exact === 0) return result('correct');
  if (exact > 0) return result('alternative');

  if (lang === 'mi') {
    if (normed.some((e) => doubleVowels(e) === n))
      return result('correct', 'Accepted: double vowels used in place of macrons.');
    const bare = stripMacrons(n);
    const mac = normed.find((e) => stripMacrons(e) === bare);
    if (mac) {
      const exp = mac.split(' ');
      const words = n.split(' ').map((t, i) => (t !== exp[i] ? exp[i] : null)).filter(Boolean);
      return result('macron', `Check the macrons: ${words.join(', ')}. A macron marks a long vowel and can change the meaning.`);
    }
  }

  const inTok = n.split(' ');
  if (normed.some((e) => tokensAreTypo(inTok, e.split(' '), lang, opts.lexicon)))
    return result('typo', 'Small spelling slip.');

  const sorted = [...inTok].sort().join(' ');
  if (inTok.length > 1 && normed.some((e) => e.split(' ').sort().join(' ') === sorted))
    return result('wrong', 'Right words, but check the word order.');
  return result('wrong');
}

/**
 * For feedback: each word of the expected answer, marked by whether the learner produced it
 * in the right relative order (longest common subsequence). Macron slips count as not matched.
 */
export function diffExpected(input: string, expected: string, lang: Lang, equivalents: Record<string, string> = {}): { word: string; ok: boolean }[] {
  const norm = lang === 'mi' ? (s: string) => normMi(s, equivalents) : normEn;
  const a = norm(input).split(' ').filter(Boolean);
  const words = expected.split(/\s+/).filter(Boolean);
  const b = words.map(norm);
  const L: number[][] = Array.from({ length: a.length + 1 }, () => Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--)
    for (let j = b.length - 1; j >= 0; j--) L[i][j] = a[i] === b[j] ? L[i + 1][j + 1] + 1 : Math.max(L[i + 1][j], L[i][j + 1]);
  const ok = new Set<number>();
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) { ok.add(j); i++; j++; } else if (L[i + 1][j] >= L[i][j + 1]) i++; else j++;
  }
  return words.map((word, j) => ({ word, ok: ok.has(j) }));
}

/** A nudge without the answer: the first word of a sentence, or the first letter and length of a word. */
export function hintFor(answer: string): string {
  const words = answer.replace(/[.,!?;:]/g, '').split(/\s+/).filter(Boolean);
  if (words.length > 1) return `${words[0]} … (${words.length} words)`;
  const chars = [...(words[0] ?? '')];
  return chars.map((ch, i) => (i === 0 ? ch : '·')).join(' ');
}
