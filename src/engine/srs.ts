/**
 * Spaced repetition. The rest of the app only uses the Scheduler interface,
 * so this SM-2-style scheduler can be swapped for FSRS later.
 */
export type Grade = 'again' | 'hard' | 'good' | 'easy';
export interface Card {
  key: string;                 // "<itemId>|<skill>"
  state: 'learning' | 'review';
  ease: number;
  interval: number;            // days
  due: number;                 // ms timestamp
  reps: number;                // successful reviews
  lapses: number;
  n: number;                   // total reviews
  first: number;
  last: number;
}
export interface Scheduler { name: string; next(prev: Card | undefined, key: string, grade: Grade, now: number): Card }

export const MIN = 60_000;
export const DAY = 86_400_000;
export const RELEARN_DELAY = 10 * MIN;
export const MAX_INTERVAL = 365;

export function startOfDay(t: number): number { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
/** Reviews fall due at 4am local time on their day, so a day's reviews are all available in the morning. */
const dueAfter = (now: number, days: number) => startOfDay(now) + days * DAY + 4 * 60 * MIN;

export const sm2: Scheduler = {
  name: 'sm2-lite',
  next(prev, key, grade, now) {
    const isNew = !prev;
    const c: Card = prev ? { ...prev } : { key, state: 'learning', ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, n: 0, first: now, last: now };
    c.n++;
    c.last = now;

    if (c.state === 'learning') {
      if (grade === 'again') { c.due = now + RELEARN_DELAY; return c; }
      const base = Math.max(1, c.interval);
      c.interval = grade === 'easy' ? Math.max(isNew ? 7 : 4, base) : base;
      c.state = 'review';
    } else if (grade === 'again') {
      c.lapses++;
      c.ease = Math.max(1.3, c.ease - 0.2);
      c.interval = Math.max(1, Math.round(c.interval * 0.25));
      c.state = 'learning';
      c.due = now + RELEARN_DELAY;
      return c;
    } else if (grade === 'hard') {
      c.ease = Math.max(1.3, c.ease - 0.15);
      c.interval = Math.max(c.interval + 1, Math.round(c.interval * 1.2));
    } else if (grade === 'good') {
      c.interval = c.interval <= 1 ? 3 : Math.max(c.interval + 1, Math.round(c.interval * c.ease));
    } else {
      c.ease = Math.min(3, c.ease + 0.15);
      c.interval = Math.max(c.interval + 3, Math.round(c.interval * c.ease * 1.3));
    }
    c.interval = Math.min(MAX_INTERVAL, c.interval);
    c.reps++;
    c.due = dueAfter(now, c.interval);
    return c;
  },
};

export const isDue = (c: Card, now: number) => c.due <= now;

export type Strength = 'new' | 'learning' | 'familiar' | 'strong';
/** Coarse, honest buckets rather than a falsely precise score. */
export function strength(c: Card | undefined): Strength {
  if (!c) return 'new';
  if (c.state === 'learning' || c.interval < 7) return 'learning';
  return c.interval < 21 ? 'familiar' : 'strong';
}

/** Estimated chance of recalling a card now, assuming ~90% recall at the scheduled interval. */
export function retrievability(c: Card, now: number): number {
  if (c.state !== 'review' || c.interval <= 0) return 0;
  return Math.pow(0.9, Math.max(0, now - c.last) / DAY / c.interval);
}

/**
 * Apply a review. Practising a card ahead of schedule and getting it right does not
 * push the schedule out further (that would inflate intervals); getting it wrong still counts.
 */
export function applyReview(prev: Card | undefined, key: string, grade: Grade, now: number, scheduler: Scheduler = sm2): Card {
  if (prev && prev.state === 'review' && !isDue(prev, now) && grade === 'good')
    return { ...prev, n: prev.n + 1 };
  return scheduler.next(prev, key, grade, now);
}
