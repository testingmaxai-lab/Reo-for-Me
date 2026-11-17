/**
 * Spaced repetition. The rest of the app only uses the Scheduler interface.
 * The app schedules with FSRS (below); the older SM-2-style scheduler is kept
 * because existing learning records were created by it and are converted on their next review.
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
  /** FSRS memory state: stability in days (time for recall to fall to 90%) and difficulty 1–10. Absent on records not yet reviewed under FSRS. */
  s?: number;
  d?: number;
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

// ---- FSRS ---------------------------------------------------------------------
// FSRS-4.5 with its published default parameters. It models each memory with a stability
// and a difficulty, and predicts recall with a power forgetting curve. Parameters are not
// yet fitted to this learner's own history.
export const FSRS_W = [0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793, 0.3246, 1.587, 0.2272, 2.8755];
const DECAY = -0.5;
const FACTOR = 19 / 81;
/** Reviews are scheduled for when predicted recall falls to this level. */
export const TARGET_RETENTION = 0.9;
const G: Record<Grade, number> = { again: 1, hard: 2, good: 3, easy: 4 };
const clampD = (d: number) => Math.min(10, Math.max(1, d));

/** Predicted probability of recall after `days` for a memory of stability `s`. */
export const recallAt = (days: number, s: number) => Math.pow(1 + (FACTOR * Math.max(0, days)) / s, DECAY);
/** Days until predicted recall falls to the target. Equals the stability when the target is 90%. */
export const intervalFor = (s: number, retention = TARGET_RETENTION) => (s / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);

/** Memory state for a record made by the old scheduler: its interval was aimed at about 90% recall. */
export function memoryOf(c: Card): { s: number; d: number } {
  if (c.s && c.d) return { s: c.s, d: c.d };
  return { s: Math.max(0.5, c.interval || 0.5), d: clampD(5 + (2.5 - c.ease) * 4) };
}

export const fsrs: Scheduler = {
  name: 'fsrs-4.5',
  next(prev, key, grade, now) {
    const w = FSRS_W, g = G[grade];
    const c: Card = prev ? { ...prev } : { key, state: 'learning', ease: 2.5, interval: 0, due: now, reps: 0, lapses: 0, n: 0, first: now, last: now };
    const elapsed = prev ? Math.max(0, now - prev.last) / DAY : 0;
    c.n++;
    c.last = now;

    if (!prev) {
      c.s = w[g - 1];
      c.d = clampD(w[4] - (g - 3) * w[5]);
    } else {
      const m = memoryOf(prev);
      const r = recallAt(elapsed, m.s);
      c.d = clampD(w[7] * w[4] + (1 - w[7]) * (m.d - w[6] * (g - 3)));
      if (grade === 'again') {
        if (prev.state === 'review') c.lapses++;
        const lapsed = w[11] * Math.pow(m.d, -w[12]) * (Math.pow(m.s + 1, w[13]) - 1) * Math.exp(w[14] * (1 - r));
        c.s = Math.max(0.1, Math.min(m.s, lapsed));
      } else if (elapsed < 0.5 && prev.state === 'learning') {
        c.s = m.s; // a repeat within the same session says little about long-term memory
      } else {
        const bonus = grade === 'hard' ? w[15] : grade === 'easy' ? w[16] : 1;
        c.s = m.s * (1 + Math.exp(w[8]) * (11 - m.d) * Math.pow(m.s, -w[9]) * (Math.exp(w[10] * (1 - r)) - 1) * bonus);
      }
    }

    if (grade === 'again') {
      c.state = 'learning';
      c.interval = Math.max(1, Math.round(intervalFor(c.s!)));
      c.due = now + RELEARN_DELAY;
      return c;
    }
    c.state = 'review';
    c.reps++;
    c.interval = Math.min(MAX_INTERVAL, Math.max(1, Math.round(intervalFor(c.s!))));
    c.due = dueAfter(now, c.interval);
    return c;
  },
};

/** Estimated chance of recalling a card now. */
export function retrievability(c: Card, now: number): number {
  if (c.state !== 'review' || c.interval <= 0) return 0;
  return recallAt((now - c.last) / DAY, memoryOf(c).s);
}

/**
 * Apply a review. Practising a card ahead of schedule and getting it right does not
 * push the schedule out further (that would inflate intervals); getting it wrong still counts.
 */
export function applyReview(prev: Card | undefined, key: string, grade: Grade, now: number, scheduler: Scheduler = fsrs): Card {
  if (prev && prev.state === 'review' && !isDue(prev, now) && grade === 'good')
    return { ...prev, n: prev.n + 1 };
  return scheduler.next(prev, key, grade, now);
}
