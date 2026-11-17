/** Starting sessions from anywhere in the UI. */
import { content } from '../content';
import { nextNew } from '../engine/recommend';
import { buildLearnSteps, buildPracticeSteps, buildReviewSteps, PACE } from '../engine/session';
import { getState, setKV } from '../store/state';
import { startSession } from './router';

/** New material: the recommended next items, or the next unlearned items within a given set. */
export function startLearn(opts: { within?: string[]; testOut?: boolean; title?: string; back?: string } = {}): boolean {
  const { cards, kv } = getState();
  const next = nextNew(content, cards, { count: PACE[kv.settings.intensity].newItems, startLevel: kv.settings.startLevel, queue: kv.queue, within: opts.within });
  if (!next.itemIds.length) return false;
  if (kv.queue.length) setKV('queue', kv.queue.filter((id) => !next.itemIds.includes(id)));
  const testOut = opts.testOut ?? next.testOut;
  startSession({ title: opts.title ?? 'Learn', mode: 'learn', back: opts.back, steps: buildLearnSteps(next.itemIds, content, !testOut) });
  return true;
}

export function startReview(back?: string, only?: (key: string) => boolean): void {
  const { cards, kv } = getState();
  startSession({ title: 'Review', mode: 'review', back, steps: buildReviewSteps(cards, content, Date.now(), PACE[kv.settings.intensity].reviews, only) });
}

export function startPractice(itemIds: string[], back?: string): void {
  startSession({ title: 'Practice', mode: 'practice', back, steps: buildPracticeSteps(itemIds, content, getState().cards) });
}

/** One tap: everything due, then the next new material. */
export function startToday(): boolean {
  const { cards, kv } = getState();
  const pace = PACE[kv.settings.intensity];
  const reviews = buildReviewSteps(cards, content, Date.now(), pace.reviews);
  const next = nextNew(content, cards, { count: pace.newItems, startLevel: kv.settings.startLevel, queue: kv.queue });
  if (!reviews.length && !next.itemIds.length) return false;
  if (kv.queue.length) setKV('queue', kv.queue.filter((id) => !next.itemIds.includes(id)));
  startSession({ title: 'Today', mode: 'learn', steps: [...reviews, ...buildLearnSteps(next.itemIds, content, !next.testOut)] });
  return true;
}
