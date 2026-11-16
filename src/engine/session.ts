/** Session construction: which steps to show, in what order. */
import type { Content } from '../content/types';
import { keyOf, parseKey, type Intensity, type Skill } from './exercises';
import { isDue, type Card } from './srs';

export type Step =
  | { t: 'intro'; itemId: string }
  | { t: 'ex'; key: string; variant?: number; fresh?: boolean; retry?: boolean };

/** Session sizes. These shape a session; they never cap what the learner may do. */
export const PACE: Record<Intensity, { newItems: number; reviews: number }> = {
  light: { newItems: 3, reviews: 10 },
  standard: { newItems: 5, reviews: 20 },
  intensive: { newItems: 8, reviews: 40 },
};

/**
 * Introduce -> retrieve -> apply for each new item, interleaved so that the second
 * exercise for an item comes after something else has intervened.
 * intro=false gives a "test out" session: no teaching, straight to retrieval.
 */
export function buildLearnSteps(itemIds: string[], content: Content, intro = true): Step[] {
  const steps: Step[] = [];
  let pending: Step[] = [];
  const tail: Step[] = [];
  for (const id of itemIds) {
    const later: Step[] = [];
    if (content.vocabById.has(id)) {
      if (intro) steps.push({ t: 'intro', itemId: id });
      steps.push({ t: 'ex', key: keyOf(id, 'recognise'), fresh: !intro });
      later.push({ t: 'ex', key: keyOf(id, 'produce'), fresh: !intro });
    } else if (content.patternById.has(id)) {
      const p = content.patternById.get(id)!;
      if (intro) steps.push({ t: 'intro', itemId: id });
      steps.push({ t: 'ex', key: keyOf(id, 'understand'), variant: 0, fresh: !intro });
      later.push({ t: 'ex', key: keyOf(id, 'apply'), variant: 0, fresh: !intro });
      if (p.transforms.length) tail.push({ t: 'ex', key: keyOf(id, 'apply'), variant: 1 });
    } else continue;
    steps.push(...pending);
    pending = later;
  }
  return [...steps, ...pending, ...tail];
}

/** Cards that are due, most overdue first, deep-learning items spread through the session. */
export function dueCards(cards: Record<string, Card>, content: Content, now: number): Card[] {
  return Object.values(cards)
    .filter((c) => isDue(c, now) && itemExists(parseKey(c.key).itemId, content))
    .sort((a, b) => a.due - b.due);
}

export function buildReviewSteps(cards: Record<string, Card>, content: Content, now: number, limit: number): Step[] {
  return dueCards(cards, content, now).slice(0, limit).map((c) => ({ t: 'ex', key: c.key }));
}

/** Practise specific items regardless of schedule (free exploration). */
export function buildPracticeSteps(itemIds: string[], content: Content, cards: Record<string, Card>): Step[] {
  const steps: Step[] = [];
  for (const id of itemIds) {
    const skills: readonly Skill[] = content.vocabById.has(id) ? ['recognise', 'produce'] : content.patternById.has(id) ? ['understand', 'apply'] : content.deepById.has(id) ? ['recall', 'meaning', 'structure', 'context'] : [];
    for (const s of skills) if (cards[keyOf(id, s)]) steps.push({ t: 'ex', key: keyOf(id, s) });
  }
  return steps;
}

export const itemExists = (id: string, c: Content) => c.vocabById.has(id) || c.patternById.has(id) || c.deepById.has(id);

/** A failed exercise comes back a few steps later in the same session. */
export function requeue(steps: Step[], index: number, gap = 3): Step[] {
  const step = steps[index];
  if (step.t !== 'ex') return steps;
  const at = Math.min(steps.length, index + 1 + gap);
  return [...steps.slice(0, at), { ...step, retry: true }, ...steps.slice(at)];
}
