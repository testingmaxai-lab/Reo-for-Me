/**
 * Voice recordings: "hear what you sound like". Short-lived by design. They stay on this
 * device, are never part of a backup, and are pruned automatically.
 */
import { DAY } from '../engine/srs';
import { getDb } from './state';

export interface Take { id: number; itemId: string; t: number; mime: string; data: ArrayBuffer }
export type TakeInfo = Pick<Take, 'id' | 'itemId' | 't'>;

export const KEEP_DAYS = 14;
export const KEEP_PER_ITEM = 4;

/**
 * Which recordings to delete: anything older than two weeks, and beyond that all but the
 * newest few for each item. The oldest surviving take is kept so "then versus now" always has a "then".
 */
export function takesToDelete(takes: TakeInfo[], now: number): number[] {
  const out: number[] = [];
  const byItem = new Map<string, TakeInfo[]>();
  for (const t of takes) {
    if (t.t < now - KEEP_DAYS * DAY) out.push(t.id);
    else byItem.set(t.itemId, [...(byItem.get(t.itemId) ?? []), t]);
  }
  for (const list of byItem.values()) {
    list.sort((a, b) => a.t - b.t);
    if (list.length > KEEP_PER_ITEM) out.push(...list.slice(1, list.length - (KEEP_PER_ITEM - 1)).map((t) => t.id));
  }
  return out;
}

export async function listTakes(itemId: string): Promise<Take[]> {
  const db = getDb();
  if (!db) return [];
  return ((await db.getAllFromIndex('audio', 'itemId', itemId)) as Take[]).sort((a, b) => a.t - b.t);
}

export async function prune(now = Date.now()): Promise<void> {
  const db = getDb();
  if (!db) return;
  const all = (await db.getAll('audio')) as Take[];
  const ids = takesToDelete(all, now);
  if (!ids.length) return;
  const tx = db.transaction('audio', 'readwrite');
  for (const id of ids) tx.store.delete(id);
  await tx.done;
}

export async function addTake(itemId: string, data: ArrayBuffer, mime: string, now = Date.now()): Promise<void> {
  const db = getDb();
  if (!db) throw new Error('Storage is not available.');
  await db.add('audio', { itemId, t: now, mime, data });
  await prune(now);
}

export async function deleteTake(id: number): Promise<void> { await getDb()?.delete('audio', id); }
export async function clearTakes(): Promise<void> { await getDb()?.clear('audio'); }
