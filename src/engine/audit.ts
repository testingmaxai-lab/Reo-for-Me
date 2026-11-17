/** Content checking by a fluent speaker, and problem reports raised while learning. */
import { firstEn } from '../content';
import type { Content, Status } from '../content/types';

export type UnitKind = 'word' | 'pattern' | 'sentence' | 'transform' | 'deep';
export const KIND_LABEL: Record<UnitKind, string> = { word: 'Word', pattern: 'Pattern explanation', sentence: 'Sentence', transform: 'Transformation', deep: 'Whakataukī / pepeha' };
/** One thing a reviewer can judge on its own. */
export interface Unit { id: string; kind: UnitKind; groupId: string; group: string; mi: string; en: string; details: { label: string; text: string }[]; status: Status }

export interface AuditEntry { v: 'ok' | 'fix'; note?: string; t: number }
export type Audit = Record<string, AuditEntry>;
export interface Flag { t: number; key: string; prompt: string; expected: string; answer: string; reason: string; note?: string }
export const FLAG_REASONS = ['My answer should be accepted', 'The expected answer looks wrong', 'The explanation is wrong or unclear', 'Something else'];

const clean = (s: string) => s.replace(/\(([^()|]*)\|([^()]*)\)/g, (_, a: string, b: string) => `${a} / ${b.split('|').join(' / ')}`);

export function reviewUnits(c: Content): Unit[] {
  const out: Unit[] = [];
  for (const t of c.topics)
    for (const v of c.vocab.filter((x) => x.topic === t.id))
      out.push({ id: v.id, kind: 'word', groupId: t.id, group: t.title, mi: v.mi, en: v.en.join('; '), status: v.status,
        details: [...(v.altMi.length ? [{ label: 'Also accepted', text: v.altMi.join(', ') }] : []), ...(v.note ? [{ label: 'Note', text: v.note }] : [])] });
  for (const p of c.patterns) {
    const g = { groupId: p.id, group: p.title, status: p.status };
    out.push({ ...g, id: p.id, kind: 'pattern', mi: p.structure, en: p.explanation, details: [] });
    for (const s of p.sentences) out.push({ ...g, id: 's:' + s.id, kind: 'sentence', mi: s.mi, en: clean(s.en), details: s.hint ? [{ label: 'Hint shown', text: s.hint }] : [] });
    for (const t of p.transforms) out.push({ ...g, id: 't:' + t.id, kind: 'transform', mi: `${t.from}  →  ${t.answers.join(' / ')}`, en: t.instruction, details: t.explain ? [{ label: 'Explanation', text: t.explain }] : [] });
  }
  for (const d of c.deep)
    out.push({ id: d.id, kind: 'deep', groupId: 'deep', group: 'Whakataukī and pepeha', mi: d.lines.map((l) => l.mi).join(' '), en: d.lines.map((l) => l.en).join(' '), status: d.status,
      details: [
        { label: 'Meaning', text: d.meaning }, ...(d.literal ? [{ label: 'Literally', text: d.literal }] : []),
        { label: 'Background', text: d.provenance }, { label: 'Context', text: d.context }, { label: 'Use', text: d.usage },
        ...(d.nuances ? [{ label: 'Notes', text: d.nuances }] : []),
        { label: 'Piece by piece', text: d.components.map((x) => `${x.mi} = ${x.gloss}${x.note ? ` (${x.note})` : ''}`).join(' · ') },
        { label: 'Questions asked', text: d.structureQs.map((q) => `${q.prompt} → ${q.answers.map(firstEn).join(' / ')}`).join(' · ') },
      ] });
  return out;
}

export function auditSummary(units: Unit[], audit: Audit) {
  let ok = 0, fix = 0;
  for (const u of units) { const a = audit[u.id]; if (a?.v === 'ok') ok++; else if (a?.v === 'fix') fix++; }
  return { total: units.length, ok, fix, left: units.length - ok - fix };
}

/** What a learner sees for an item's status, taking a check made on this device into account. */
export function effectiveStatus(status: Status, entry: AuditEntry | undefined): { status: Status; local?: 'ok' | 'fix' } {
  if (entry?.v === 'ok') return { status: 'verified', local: 'ok' };
  if (entry?.v === 'fix') return { status, local: 'fix' };
  return { status };
}

export const FEEDBACK_FORMAT = 'reo-content-feedback';
/** A self-explanatory file: each judgement carries the text it was made about, so it can be acted on later even if ids move. */
export function makeFeedback(units: Unit[], audit: Audit, flags: Flag[], now: number) {
  const byId = new Map(units.map((u) => [u.id, u]));
  return {
    format: FEEDBACK_FORMAT, version: 1, exportedAt: now,
    summary: auditSummary(units, audit),
    checked: Object.entries(audit).map(([id, a]) => ({ id, verdict: a.v, note: a.note ?? '', checkedAt: a.t, kind: byId.get(id)?.kind ?? 'removed', mi: byId.get(id)?.mi ?? '', en: byId.get(id)?.en ?? '' })),
    reports: flags,
  };
}

export type FeedbackResult = { ok: true; audit: Audit; flags: Flag[] } | { ok: false; error: string };
export function parseFeedback(text: string): FeedbackResult {
  let raw: any;
  try { raw = JSON.parse(text); } catch { return { ok: false, error: 'This file is not valid JSON.' }; }
  if (raw?.format !== FEEDBACK_FORMAT || !Array.isArray(raw.checked)) return { ok: false, error: 'This is not a content feedback file from this app.' };
  const audit: Audit = {};
  for (const x of raw.checked) {
    if (typeof x?.id !== 'string' || (x.verdict !== 'ok' && x.verdict !== 'fix')) return { ok: false, error: 'The file contains a damaged entry.' };
    audit[x.id] = { v: x.verdict, t: Number(x.checkedAt) || 0, ...(typeof x.note === 'string' && x.note ? { note: x.note.slice(0, 1000) } : {}) };
  }
  const flags: Flag[] = (Array.isArray(raw.reports) ? raw.reports : []).filter((f: any) => f && typeof f.prompt === 'string' && typeof f.reason === 'string')
    .map((f: any) => ({ t: Number(f.t) || 0, key: String(f.key ?? ''), prompt: f.prompt, expected: String(f.expected ?? ''), answer: String(f.answer ?? ''), reason: f.reason, ...(f.note ? { note: String(f.note).slice(0, 1000) } : {}) }));
  return { ok: true, audit, flags };
}

/** Combine checks from another device with those here; the more recent judgement on each item wins. */
export function mergeFeedback(mine: { audit: Audit; flags: Flag[] }, theirs: { audit: Audit; flags: Flag[] }) {
  const audit: Audit = { ...mine.audit };
  for (const [id, a] of Object.entries(theirs.audit)) if (!audit[id] || a.t >= audit[id].t) audit[id] = a;
  const seen = new Set(mine.flags.map((f) => `${f.t}|${f.prompt}|${f.reason}`));
  return { audit, flags: [...mine.flags, ...theirs.flags.filter((f) => !seen.has(`${f.t}|${f.prompt}|${f.reason}`))] };
}
