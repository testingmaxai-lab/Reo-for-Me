/** Progress indicators. Deliberately coarse: buckets and rounded estimates, no invented precision. */
import type { Content } from '../content/types';
import { keyOf, type Skill } from './exercises';
import { dueCards } from './session';
import { DAY, retrievability, strength, type Card, type Grade, type Strength } from './srs';

export interface ReviewLog { t: number; key: string; grade: Grade; verdict: string }
export type Buckets = Record<Strength, number> & { total: number };

export function skillBuckets(itemIds: string[], skill: Skill, cards: Record<string, Card>): Buckets {
  const b: Buckets = { new: 0, learning: 0, familiar: 0, strong: 0, total: itemIds.length };
  for (const id of itemIds) b[strength(cards[keyOf(id, skill)])]++;
  return b;
}

export function summary(c: Content, cards: Record<string, Card>, reviews: ReviewLog[], now: number) {
  const vocabIds = c.vocab.map((v) => v.id);
  const patternIds = c.patterns.map((p) => p.id);
  const week = reviews.filter((r) => r.t > now - 7 * DAY);
  const reviewCards = Object.values(cards).filter((x) => x.state === 'review');
  const retention = reviewCards.length >= 10 ? reviewCards.reduce((s, x) => s + retrievability(x, now), 0) / reviewCards.length : null;
  return {
    recognise: skillBuckets(vocabIds, 'recognise', cards),
    produce: skillBuckets(vocabIds, 'produce', cards),
    understand: skillBuckets(patternIds, 'understand', cards),
    apply: skillBuckets(patternIds, 'apply', cards),
    due: dueCards(cards, c, now).length,
    reviewsThisWeek: week.length,
    daysActiveThisWeek: new Set(week.map((r) => new Date(r.t).toDateString())).size,
    accuracyThisWeek: week.length >= 10 ? week.filter((r) => r.grade !== 'again').length / week.length : null,
    /** rounded to the nearest 5% when shown; null until there is enough data to say anything */
    retention,
  };
}

export const roughPercent = (x: number) => (x >= 0.95 ? 'over 95%' : `about ${Math.round((x * 100) / 5) * 5}%`);
