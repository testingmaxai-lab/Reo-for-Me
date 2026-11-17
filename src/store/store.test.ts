import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { DAY } from '../engine/srs';
import { FORMAT, parseBackup, SCHEMA_VERSION } from './backup';
import { addTake, clearTakes, deleteTake, KEEP_PER_ITEM, listTakes, prune, takesToDelete } from './audio';
import * as store from './state';

const NOW = new Date(2026, 10, 16, 9, 0).getTime();
let n = 0;
let name = '';
beforeEach(async () => { store._close(); name = `test-${n++}`; await store.init(name); });
const reopen = async () => { store._close(); await store.init(name); };

describe('persistence', () => {
  it('starts empty with default settings', () => {
    const s = store.getState();
    expect(s.ready).toBe(true);
    expect(s.cards).toEqual({});
    expect(s.kv.settings.intensity).toBe('standard');
  });
  it('keeps schedules, history and settings after the app is closed and reopened', async () => {
    store.review('v:kurī|recognise', 'good', 'correct', NOW);
    store.review('v:kurī|produce', 'again', 'wrong', NOW);
    store.updateSettings({ intensity: 'intensive', startLevel: 2 });
    store.setKV('deep', { 'd:he-tangata': { stage: 2, startedAt: NOW } });
    store.setKV('slots', { 'd:pepeha-tauiwi': { name: 'Max' } });
    await new Promise((r) => setTimeout(r, 20));
    await reopen();
    const s = store.getState();
    expect(s.cards['v:kurī|recognise'].interval).toBe(4);
    expect(s.cards['v:kurī|recognise'].s).toBeGreaterThan(3);
    expect(s.cards['v:kurī|produce'].state).toBe('learning');
    expect(s.reviews).toHaveLength(2);
    expect(s.kv.settings).toMatchObject({ intensity: 'intensive', startLevel: 2 });
    expect(s.kv.deep['d:he-tangata'].stage).toBe(2);
    expect(s.kv.slots['d:pepeha-tauiwi'].name).toBe('Max');
  });
  it('moves a record through new -> learning -> review -> lapse -> review', () => {
    const k = 'v:ngeru|produce';
    expect(store.review(k, 'again', 'wrong', NOW).state).toBe('learning');
    expect(store.review(k, 'good', 'correct', NOW + 1000).state).toBe('review');
    expect(store.review(k, 'good', 'correct', NOW + DAY).interval).toBeGreaterThan(1);
    const lapsed = store.review(k, 'again', 'wrong', NOW + 4 * DAY);
    expect(lapsed.state).toBe('learning');
    expect(lapsed.lapses).toBe(1);
    expect(store.review(k, 'good', 'correct', NOW + 4 * DAY + 1000).state).toBe('review');
    expect(store.getState().reviews).toHaveLength(5);
  });
});

describe('export and import', () => {
  it('round-trips all progress through a backup file', async () => {
    store.review('v:kurī|recognise', 'good', 'correct', NOW);
    store.review('p:kei-te|apply', 'hard', 'macron', NOW);
    store.updateSettings({ intensity: 'light' });
    store.setKV('queue', ['v:ao']);
    const json = store.exportJson(NOW);
    const before = store.getState();
    await store.resetAll();
    expect(store.getState().cards).toEqual({});
    const res = await store.importJson(json);
    expect(res).toEqual({ ok: true, cards: 2 });
    expect(store.getState().cards).toEqual(before.cards);
    expect(store.getState().reviews).toEqual(before.reviews);
    expect(store.getState().kv).toEqual(before.kv);
    await reopen();
    expect(Object.keys(store.getState().cards)).toHaveLength(2);
    expect(store.getState().kv.queue).toEqual(['v:ao']);
  });
  it('keeps what was typed for missed answers, through a reopen and a backup', async () => {
    store.review('v:tāua|produce', 'again', 'wrong', NOW, { a: 'māua', e: 'confusion' });
    store.review('v:kurī|produce', 'good', 'correct', NOW);
    await new Promise((r) => setTimeout(r, 20));
    await reopen();
    expect(store.getState().reviews[0]).toMatchObject({ a: 'māua', e: 'confusion' });
    expect(store.getState().reviews[1].a).toBeUndefined();
    const json = store.exportJson(NOW);
    await store.resetAll();
    await store.importJson(json);
    expect(store.getState().reviews[0]).toMatchObject({ a: 'māua', e: 'confusion' });
    const tampered = JSON.parse(json); tampered.reviews[0].e = 'nonsense'; tampered.reviews[0].a = 42;
    await store.importJson(JSON.stringify(tampered));
    expect(store.getState().reviews[0].e).toBeUndefined();
    expect(store.getState().reviews[0].a).toBeUndefined();
  });
  it('rejects files that are not valid backups and leaves existing data alone', async () => {
    store.review('v:kurī|recognise', 'good', 'correct', NOW);
    const good = JSON.parse(store.exportJson(NOW));
    const bad = [
      'not json',
      '{}',
      JSON.stringify({ ...good, format: 'something-else' }),
      JSON.stringify({ ...good, schemaVersion: SCHEMA_VERSION + 1 }),
      JSON.stringify({ ...good, cards: 'x' }),
      JSON.stringify({ ...good, cards: [{ key: 'nokey' }] }),
      JSON.stringify({ ...good, cards: [{ ...good.cards[0], interval: 'soon' }] }),
      JSON.stringify({ ...good, reviews: [{ t: 1, key: 'a|b', grade: 'perfect' }] }),
    ];
    for (const text of bad) {
      const r = await store.importJson(text);
      expect(r.ok, text.slice(0, 40)).toBe(false);
    }
    expect(Object.keys(store.getState().cards)).toEqual(['v:kurī|recognise']);
  });
  it('explains a backup from a newer version', () => {
    const r = parseBackup(JSON.stringify({ format: FORMAT, schemaVersion: 99, cards: [], reviews: [], kv: {} }));
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/newer version/) });
  });
  it('fills in defaults for settings missing from an older backup', () => {
    const r = parseBackup(JSON.stringify({ format: FORMAT, schemaVersion: 1, exportedAt: 1, cards: [], reviews: [], kv: { settings: { intensity: 'bogus' } } }));
    expect(r.ok && r.backup.kv.settings.intensity).toBe('standard');
    expect(r.ok && r.backup.kv.queue).toEqual([]);
  });
});

describe('voice recordings', () => {
  const buf = (n: number) => new Uint8Array([n, n, n]).buffer;
  it('decides what to delete: old takes, and the middle ones when an item has too many', () => {
    const t = (id: number, itemId: string, daysAgo: number) => ({ id, itemId, t: NOW - daysAgo * DAY });
    expect(takesToDelete([t(1, 'a', 20), t(2, 'a', 13), t(3, 'b', 0)], NOW)).toEqual([1]);
    // six takes of one item: keep the earliest (the "then") and the newest three
    const six = [t(1, 'a', 6), t(2, 'a', 5), t(3, 'a', 4), t(4, 'a', 3), t(5, 'a', 2), t(6, 'a', 1)];
    expect(takesToDelete(six, NOW)).toEqual([2, 3]);
    expect(six.length - takesToDelete(six, NOW).length).toBe(KEEP_PER_ITEM);
    expect(takesToDelete([], NOW)).toEqual([]);
  });
  it('stores takes per item, survives a reopen, and prunes automatically', async () => {
    await addTake('v:kurī', buf(1), 'audio/mp4', NOW - 13 * DAY);
    await addTake('v:kurī', buf(2), 'audio/mp4', NOW - DAY);
    await addTake('v:ngeru', buf(3), 'audio/webm', NOW);
    expect(await listTakes('v:kurī')).toHaveLength(2);
    await addTake('v:kurī', buf(4), 'audio/mp4', NOW + 2 * DAY); // saving prunes: the first take is now over two weeks old
    const takes = await listTakes('v:kurī');
    expect(takes.map((x) => new Uint8Array(x.data)[0])).toEqual([2, 4]);
    expect(takes[0].mime).toBe('audio/mp4');
    store._close(); await store.init(name);
    expect(await listTakes('v:kurī')).toHaveLength(2);
    await deleteTake(takes[0].id);
    expect(await listTakes('v:kurī')).toHaveLength(1);
    await prune(NOW + 30 * DAY);
    expect(await listTakes('v:kurī')).toHaveLength(0);
    expect(await listTakes('v:ngeru')).toHaveLength(0);
  });
  it('keeps recordings out of backups and removes them on reset', async () => {
    await addTake('v:kurī', buf(1), 'audio/mp4', NOW);
    store.review('v:kurī|recognise', 'good', 'correct', NOW);
    const json = store.exportJson(NOW);
    expect(json).not.toContain('audio');
    await store.importJson(json);
    expect(await listTakes('v:kurī')).toHaveLength(1); // restoring progress leaves recordings alone
    await store.resetAll();
    expect(await listTakes('v:kurī')).toHaveLength(0);
    await addTake('v:kurī', buf(1), 'audio/mp4', NOW); await clearTakes();
    expect(await listTakes('v:kurī')).toHaveLength(0);
  });
  it('keeps content checks and reports through a backup', async () => {
    store.setKV('audit', { 'v:kurī': { v: 'fix', t: NOW, note: 'check macron' } });
    store.setKV('flags', [{ t: NOW, key: 'k', prompt: 'p', expected: 'e', answer: 'a', reason: 'r' }]);
    const json = store.exportJson(NOW);
    await store.resetAll();
    expect(store.getState().kv.audit).toEqual({});
    await store.importJson(json);
    expect(store.getState().kv.audit['v:kurī'].note).toBe('check macron');
    expect(store.getState().kv.flags).toHaveLength(1);
  });
});
