/** Export / import format, validation and schema migration. */
import type { Intensity } from '../engine/exercises';
import type { ReviewLog } from '../engine/progress';
import type { DiagnosticResult } from '../engine/recommend';
import type { Card } from '../engine/srs';

export const SCHEMA_VERSION = 1;
export const FORMAT = 'reo-progress';

export type Theme = 'auto' | 'light' | 'dark';
export interface Settings { intensity: Intensity; startLevel: number; onboarded: boolean; lastBackup: number; theme: Theme }
export interface DeepProgress { stage: number; startedAt: number; completedAt?: number }
export interface KV {
  settings: Settings;
  diagnostic: DiagnosticResult | null;
  deep: Record<string, DeepProgress>;
  slots: Record<string, Record<string, string>>;
  queue: string[];
}
export const defaultKV = (): KV => ({
  settings: { intensity: 'standard', startLevel: 1, onboarded: false, lastBackup: 0, theme: 'auto' },
  diagnostic: null, deep: {}, slots: {}, queue: [],
});

export interface Backup { format: typeof FORMAT; schemaVersion: number; exportedAt: number; cards: Card[]; reviews: ReviewLog[]; kv: KV }

export function makeBackup(cards: Record<string, Card>, reviews: ReviewLog[], kv: KV, now: number): Backup {
  return { format: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: now, cards: Object.values(cards), reviews, kv };
}

/** Upgrades older backups step by step. Add a case here whenever SCHEMA_VERSION is raised. */
function migrate(data: any): any {
  const v = data.schemaVersion;
  // if (v === 1) { ...; v = 2 }
  return { ...data, schemaVersion: v };
}

const isNum = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);
const GRADES = ['again', 'hard', 'good', 'easy'];

export type ParseResult = { ok: true; backup: Backup } | { ok: false; error: string };

/** Validates untrusted JSON text before anything is written to storage. */
export function parseBackup(text: string): ParseResult {
  let raw: any;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  if (!raw || typeof raw !== 'object' || raw.format !== FORMAT) return { ok: false, error: 'This is not a progress backup from this app.' };
  if (!isNum(raw.schemaVersion) || raw.schemaVersion < 1) return { ok: false, error: 'The backup has no valid version number.' };
  if (raw.schemaVersion > SCHEMA_VERSION) return { ok: false, error: 'This backup was made by a newer version of the app. Update the app, then import again.' };
  const data = migrate(raw);
  if (!Array.isArray(data.cards) || !Array.isArray(data.reviews) || !data.kv || typeof data.kv !== 'object') return { ok: false, error: 'The backup is incomplete.' };
  for (const c of data.cards) {
    if (!c || typeof c.key !== 'string' || !c.key.includes('|') || !['learning', 'review'].includes(c.state) || ![c.ease, c.interval, c.due, c.reps, c.lapses, c.n, c.first, c.last].every(isNum))
      return { ok: false, error: 'The backup contains a damaged learning record.' };
  }
  for (const r of data.reviews) {
    if (!r || !isNum(r.t) || typeof r.key !== 'string' || !GRADES.includes(r.grade)) return { ok: false, error: 'The backup contains a damaged review entry.' };
  }
  const d = defaultKV();
  const kv: KV = {
    settings: { ...d.settings, ...(data.kv.settings ?? {}) },
    diagnostic: data.kv.diagnostic ?? null,
    deep: data.kv.deep ?? {}, slots: data.kv.slots ?? {},
    queue: Array.isArray(data.kv.queue) ? data.kv.queue.filter((x: unknown) => typeof x === 'string') : [],
  };
  if (!['light', 'standard', 'intensive'].includes(kv.settings.intensity)) kv.settings.intensity = 'standard';
  if (!['auto', 'light', 'dark'].includes(kv.settings.theme)) kv.settings.theme = 'auto';
  return { ok: true, backup: { format: FORMAT, schemaVersion: SCHEMA_VERSION, exportedAt: isNum(data.exportedAt) ? data.exportedAt : 0, cards: data.cards, reviews: data.reviews.map((r: any) => ({ t: r.t, key: r.key, grade: r.grade, verdict: String(r.verdict ?? '') })), kv } };
}
