/** In-memory app state, written through to IndexedDB on every change. */
import { useSyncExternalStore } from 'react';
import type { ReviewLog } from '../engine/progress';
import { applyReview, type Card, type Grade } from '../engine/srs';
import { defaultKV, makeBackup, parseBackup, type KV } from './backup';
import * as db from './db';

export interface AppState { ready: boolean; error?: string; cards: Record<string, Card>; reviews: ReviewLog[]; kv: KV }

let state: AppState = { ready: false, cards: {}, reviews: [], kv: defaultKV() };
let handle: db.DB | null = null;
const listeners = new Set<() => void>();
const set = (next: AppState) => { state = next; listeners.forEach((l) => l()); };

export const getState = () => state;
export function useAppState(): AppState {
  return useSyncExternalStore((l) => { listeners.add(l); return () => listeners.delete(l); }, getState);
}

export async function init(dbName?: string): Promise<void> {
  try {
    handle = await db.open(dbName);
    set({ ready: true, ...(await db.loadAll(handle)) });
    // Ask the browser not to evict our data under storage pressure (best effort).
    void globalThis.navigator?.storage?.persist?.().catch(() => false);
  } catch (e) {
    set({ ...state, ready: true, error: 'Could not open storage on this device. Progress will not be saved. (Private browsing mode can cause this.)' });
    console.error(e);
  }
}

/** Record one review: updates the schedule for that skill and appends to the history. */
export function review(key: string, grade: Grade, verdict: string, now = Date.now()): Card {
  const card = applyReview(state.cards[key], key, grade, now);
  const log: ReviewLog = { t: now, key, grade, verdict };
  set({ ...state, cards: { ...state.cards, [key]: card }, reviews: [...state.reviews, log] });
  if (handle) void db.saveReview(handle, card, log).catch(console.error);
  return card;
}

export function setKV<K extends keyof KV>(key: K, value: KV[K]): void {
  set({ ...state, kv: { ...state.kv, [key]: value } });
  if (handle) void db.saveKV(handle, key, value).catch(console.error);
}
export const updateSettings = (patch: Partial<KV['settings']>) => setKV('settings', { ...state.kv.settings, ...patch });

export function exportJson(now = Date.now()): string {
  return JSON.stringify(makeBackup(state.cards, state.reviews, state.kv, now));
}

export async function importJson(text: string): Promise<{ ok: true; cards: number } | { ok: false; error: string }> {
  const parsed = parseBackup(text);
  if (!parsed.ok) return parsed;
  const b = parsed.backup;
  if (handle) await db.replaceAll(handle, b);
  set({ ready: true, cards: Object.fromEntries(b.cards.map((c) => [c.key, c])), reviews: b.reviews, kv: b.kv });
  return { ok: true, cards: b.cards.length };
}

export async function resetAll(): Promise<void> {
  const empty = { cards: [], reviews: [], kv: defaultKV() };
  if (handle) await db.replaceAll(handle, empty);
  set({ ready: true, cards: {}, reviews: [], kv: empty.kv });
}

/** For tests: forget in-memory state and close the database, as if the app had been closed. */
export function _close(): void { handle?.close(); handle = null; state = { ready: false, cards: {}, reviews: [], kv: defaultKV() }; }
