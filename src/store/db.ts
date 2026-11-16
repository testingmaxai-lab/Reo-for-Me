/** IndexedDB persistence. All learning data stays on this device. */
import { openDB, type IDBPDatabase } from 'idb';
import type { ReviewLog } from '../engine/progress';
import type { Card } from '../engine/srs';
import { defaultKV, type Backup, type KV } from './backup';

const DB_NAME = 'reo-for-max';
/** Raise when stores change, and add a branch to upgrade(); existing data is kept across upgrades. */
const DB_VERSION = 1;

export type DB = IDBPDatabase<any>;

export function open(name = DB_NAME): Promise<DB> {
  return openDB(name, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 1) {
        db.createObjectStore('cards', { keyPath: 'key' });
        db.createObjectStore('reviews', { autoIncrement: true });
        db.createObjectStore('kv');
      }
    },
  });
}

export async function loadAll(db: DB): Promise<{ cards: Record<string, Card>; reviews: ReviewLog[]; kv: KV }> {
  const [cards, reviews, keys, vals] = await Promise.all([db.getAll('cards'), db.getAll('reviews'), db.getAllKeys('kv'), db.getAll('kv')]);
  const d = defaultKV();
  const stored = Object.fromEntries(keys.map((k, i) => [k as string, vals[i]]));
  const kv: KV = { ...d, ...stored, settings: { ...d.settings, ...(stored.settings ?? {}) } };
  return { cards: Object.fromEntries((cards as Card[]).map((c) => [c.key, c])), reviews, kv };
}

export async function saveReview(db: DB, card: Card, log: ReviewLog): Promise<void> {
  const tx = db.transaction(['cards', 'reviews'], 'readwrite');
  await Promise.all([tx.objectStore('cards').put(card), tx.objectStore('reviews').add(log), tx.done]);
}

export const saveKV = <K extends keyof KV>(db: DB, key: K, value: KV[K]) => db.put('kv', value, key).then(() => undefined);

/** Replace everything with the contents of a validated backup, in one transaction. */
export async function replaceAll(db: DB, b: Pick<Backup, 'cards' | 'reviews' | 'kv'>): Promise<void> {
  const tx = db.transaction(['cards', 'reviews', 'kv'], 'readwrite');
  const cards = tx.objectStore('cards'), reviews = tx.objectStore('reviews'), kv = tx.objectStore('kv');
  await Promise.all([cards.clear(), reviews.clear(), kv.clear()]);
  for (const c of b.cards) cards.put(c);
  for (const r of b.reviews) reviews.add(r);
  for (const [k, v] of Object.entries(b.kv)) kv.put(v, k);
  await tx.done;
}
