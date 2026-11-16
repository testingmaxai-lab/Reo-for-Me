/** Curriculum: recommended order, what to learn next, diagnostic, weak areas. Nothing here locks content. */
import type { Content } from '../content/types';
import { seeded, shuffle, type Rng } from './deep';
import { keyOf, parseKey, type Skill } from './exercises';
import type { Step } from './session';
import type { Card } from './srs';

export interface Unit { id: string; kind: 'vocab' | 'pattern'; title: string; level: number; order: number; itemIds: string[] }

/** The recommended pathway: vocabulary groups and sentence patterns, ordered by level then position. */
export function units(c: Content): Unit[] {
  const out: Unit[] = [];
  for (const t of c.topics)
    for (const level of [...new Set(c.vocab.filter((v) => v.topic === t.id).map((v) => v.level))])
      out.push({ id: `u:${t.id}:${level}`, kind: 'vocab', title: t.title, level, order: t.order, itemIds: c.vocab.filter((v) => v.topic === t.id && v.level === level).map((v) => v.id) });
  for (const p of c.patterns) out.push({ id: `u:${p.id}`, kind: 'pattern', title: p.title, level: p.level, order: p.order, itemIds: [p.id] });
  return out.sort((a, b) => a.level - b.level || a.order - b.order);
}

export const firstSkill = (itemId: string): Skill => (itemId.startsWith('p:') ? 'understand' : 'recognise');
export const isIntroduced = (itemId: string, cards: Record<string, Card>) => !!cards[keyOf(itemId, firstSkill(itemId))];

export interface NextNew { itemIds: string[]; /** items below the learner's starting level: offered as a quick check, no teaching */ testOut: boolean; unit?: Unit }

/**
 * Next new material. Order: anything the learner queued (e.g. words from a whakataukī),
 * then the pathway from their starting level, then earlier levels as quick "test out" checks.
 * A sentence pattern counts as two items of effort.
 */
export function nextNew(c: Content, cards: Record<string, Card>, opts: { count: number; startLevel?: number; queue?: string[]; within?: string[] }): NextNew {
  const fresh = (id: string) => !isIntroduced(id, cards);
  const take = (ids: string[]) => {
    const out: string[] = [];
    let cost = 0;
    for (const id of ids) {
      if (cost >= opts.count) break;
      out.push(id);
      cost += id.startsWith('p:') ? 2 : 1;
    }
    return out;
  };
  if (opts.within) return { itemIds: take(opts.within.filter(fresh)), testOut: false };
  const queued = (opts.queue ?? []).filter((id) => (c.vocabById.has(id) || c.patternById.has(id)) && fresh(id));
  if (queued.length) return { itemIds: take(queued), testOut: false };
  const start = opts.startLevel ?? 1;
  const all = units(c);
  for (const u of all.filter((u) => u.level >= start)) {
    const ids = u.itemIds.filter(fresh);
    if (ids.length) return { itemIds: take(ids), testOut: false, unit: u };
  }
  for (const u of all.filter((u) => u.level < start)) {
    const ids = u.itemIds.filter(fresh);
    if (ids.length) return { itemIds: take(ids), testOut: true, unit: u };
  }
  return { itemIds: [], testOut: false };
}

/** Prerequisite patterns not yet started. Shown as a suggestion only. */
export function unmetPrereqs(patternId: string, c: Content, cards: Record<string, Card>): string[] {
  return (c.patternById.get(patternId)?.prereqs ?? []).filter((id) => !isIntroduced(id, cards));
}

// ---- Diagnostic -------------------------------------------------------------

export interface DiagnosticQ { step: Extract<Step, { t: 'ex' }>; level: number }
export interface DiagnosticResult { takenAt: number; byLevel: Record<number, { correct: number; total: number }>; recommendedLevel: number }

/** A short sample across levels: per level, three words and two sentence exercises. */
export function buildDiagnostic(c: Content, rng: Rng = seeded(Date.now())): DiagnosticQ[] {
  const qs: DiagnosticQ[] = [];
  for (const level of [1, 2, 3]) {
    const words = shuffle(c.vocab.filter((v) => v.level === level && !v.selfCheck), rng).slice(0, 3);
    words.forEach((v, i) => qs.push({ level, step: { t: 'ex', key: keyOf(v.id, i === 1 ? 'recognise' : 'produce'), fresh: true } }));
    const pats = shuffle(c.patterns.filter((p) => p.level === level), rng).slice(0, 2);
    pats.forEach((p, i) => qs.push({ level, step: { t: 'ex', key: keyOf(p.id, i === 0 ? 'apply' : 'understand'), variant: Math.floor(rng() * p.sentences.length) * 2 + 2, fresh: true } }));
  }
  return qs;
}

export const PASS_MARK = 0.7;
/** Start at the first level the learner did not comfortably pass. A rough guide, not a proficiency measure. */
export function scoreDiagnostic(answers: { level: number; correct: boolean }[], now: number): DiagnosticResult {
  const byLevel: DiagnosticResult['byLevel'] = {};
  for (const a of answers) {
    byLevel[a.level] ??= { correct: 0, total: 0 };
    byLevel[a.level].total++;
    if (a.correct) byLevel[a.level].correct++;
  }
  let recommendedLevel = 1;
  for (const level of [1, 2, 3]) {
    const r = byLevel[level];
    if (!r || r.correct / r.total < PASS_MARK) break;
    recommendedLevel = Math.min(3, level + 1);
  }
  return { takenAt: now, byLevel, recommendedLevel };
}

// ---- Weak areas ---------------------------------------------------------------

export interface WeakArea { itemId: string; label: string; skill: Skill; lapses: number }
export function weakAreas(c: Content, cards: Record<string, Card>, limit = 8): WeakArea[] {
  const out: WeakArea[] = [];
  for (const card of Object.values(cards)) {
    if (card.lapses < 2 && card.ease > 2.0) continue;
    const { itemId, skill } = parseKey(card.key);
    const label = c.vocabById.get(itemId)?.mi ?? c.patternById.get(itemId)?.title ?? c.deepById.get(itemId)?.title;
    if (label) out.push({ itemId, label, skill, lapses: card.lapses });
  }
  return out.sort((a, b) => b.lapses - a.lapses).slice(0, limit);
}
