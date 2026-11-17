/** Loads /content/*.json, applies defaults, derives links, and validates. */
import vocabJson from '../../content/vocab.json';
import grammarJson from '../../content/grammar.json';
import deepJson from '../../content/deep.json';
import equivalentsJson from '../../content/equivalents.json';
import { normMi, stripMacrons } from '../engine/normalize';
import type { Content, DeepItem, Pattern, Status, Topic, VocabItem } from './types';

interface Raw { vocab: any; grammar: any; deep: any; equivalents: any }
const STATUSES: Status[] = ['verified', 'cross-checked', 'draft', 'example'];
const slug = (s: string) => s.normalize('NFC').toLowerCase().trim().replace(/\s+/g, '-');

export function buildContent(raw: Raw): Content {
  const equivalents: Record<string, string> = raw.equivalents?.pairs ?? {};
  const vd = raw.vocab.defaults ?? {};
  const topics: Topic[] = [];
  const vocab: VocabItem[] = [];
  for (const t of raw.vocab.topics ?? []) {
    topics.push({ id: t.id, title: t.title, order: t.order ?? 0 });
    for (const it of t.items ?? [])
      vocab.push({
        id: 'v:' + (it.id ?? slug(it.mi)), mi: it.mi, altMi: it.altMi ?? [], en: it.en ?? [], topic: t.id,
        level: it.level ?? 1, note: it.note, selfCheck: it.selfCheck,
        status: it.status ?? vd.status ?? 'draft', source: it.source ?? vd.source ?? '',
      });
  }
  topics.sort((a, b) => a.order - b.order);

  const gd = raw.grammar.defaults ?? {};
  const patterns: Pattern[] = (raw.grammar.patterns ?? []).map((p: any): Pattern => ({
    id: 'p:' + p.id, title: p.title, level: p.level ?? 1, order: p.order ?? 0,
    prereqs: (p.prereqs ?? []).map((x: string) => 'p:' + x),
    structure: p.structure ?? '', explanation: p.explanation ?? '',
    sentences: (p.sentences ?? []).map((s: any, i: number) => ({ id: `${p.id}/s${i}`, pattern: 'p:' + p.id, mi: s.mi, en: s.en, hint: s.hint })),
    transforms: (p.transforms ?? []).map((s: any, i: number) => ({ id: `${p.id}/t${i}`, pattern: 'p:' + p.id, from: s.from, fromEn: s.fromEn ?? '', instruction: s.instruction, answers: s.answers ?? [], explain: s.explain })),
    status: p.status ?? gd.status ?? 'draft', source: p.source ?? gd.source ?? '',
  }));
  patterns.sort((a, b) => a.level - b.level || a.order - b.order);

  const dd = raw.deep.defaults ?? {};
  const deep: DeepItem[] = (raw.deep.items ?? []).map((d: any): DeepItem => ({
    ...d, id: 'd:' + d.id,
    components: (d.components ?? []).map((c: any) => ({ ...c, pattern: c.pattern ? 'p:' + c.pattern : undefined })),
    structureQs: d.structureQs ?? [], lines: d.lines ?? [],
    status: d.status ?? dd.status ?? 'draft', source: d.source ?? dd.source ?? '',
  }));

  const lexicon = new Set<string>();
  const add = (s: string) => normMi(s.replace(/\{[^}]*\}/g, ' '), equivalents).split(' ').forEach((t) => t && lexicon.add(t));
  const vocabByForm = new Map<string, VocabItem>();
  for (const v of vocab) {
    add(v.mi); v.altMi.forEach(add);
    const form = normMi(v.mi, equivalents);
    if (!form.includes(' ')) vocabByForm.set(form, v);
  }
  for (const p of patterns) { p.sentences.forEach((s) => add(s.mi)); p.transforms.forEach((t) => { add(t.from); t.answers.forEach(add); }); }
  for (const d of deep) d.lines.forEach((l) => add(l.mi));

  return {
    topics, vocab, patterns, deep, equivalents, lexicon, vocabByForm,
    vocabById: new Map(vocab.map((v) => [v.id, v])),
    patternById: new Map(patterns.map((p) => [p.id, p])),
    deepById: new Map(deep.map((d) => [d.id, d])),
  };
}

/** Returns a list of problems in the content files (empty = fine). Run by the test suite. */
export function validateContent(c: Content): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  const uniq = (id: string) => { if (ids.has(id)) errs.push(`Duplicate id: ${id}`); ids.add(id); };
  const status = (id: string, s: string) => { if (!STATUSES.includes(s as Status)) errs.push(`${id}: unknown status "${s}"`); };
  for (const v of c.vocab) {
    uniq(v.id); status(v.id, v.status);
    if (!v.mi?.trim()) errs.push(`${v.id}: missing Māori text`);
    if (!v.en.length) errs.push(`${v.id}: needs at least one English meaning`);
    if (!v.source) errs.push(`${v.id}: missing source`);
    if (/aa|ee|ii|oo|uu/.test(v.mi) && !/whakaaro|ātaahua/.test(v.mi)) errs.push(`${v.id}: double vowel — use a macron?`);
  }
  for (const p of c.patterns) {
    uniq(p.id); status(p.id, p.status);
    if (!p.explanation) errs.push(`${p.id}: missing explanation`);
    if (p.sentences.length < 2) errs.push(`${p.id}: needs at least two sentences`);
    for (const pre of p.prereqs) if (!c.patternById.has(pre)) errs.push(`${p.id}: unknown prerequisite ${pre}`);
    for (const s of p.sentences) if (!s.mi || !s.en) errs.push(`${s.id}: sentence needs mi and en`);
    for (const t of p.transforms) if (!t.from || !t.instruction || !t.answers.length) errs.push(`${t.id}: transform needs from, instruction and answers`);
  }
  for (const d of c.deep) {
    uniq(d.id); status(d.id, d.status);
    if (!d.lines.length) errs.push(`${d.id}: no lines`);
    if (!d.provenance) errs.push(`${d.id}: missing provenance`);
    if (!d.source) errs.push(`${d.id}: missing source`);
    const slots = new Set((d.slots ?? []).map((s) => s.id));
    for (const l of d.lines) for (const m of l.mi.matchAll(/\{(\w+)\}/g)) if (!slots.has(m[1])) errs.push(`${d.id}: undefined slot {${m[1]}}`);
    for (const comp of d.components) if (comp.pattern && !c.patternById.has(comp.pattern)) errs.push(`${d.id}: unknown pattern ${comp.pattern}`);
  }
  return errs;
}

export const content: Content = buildContent({ vocab: vocabJson, grammar: grammarJson, deep: deepJson, equivalents: equivalentsJson });

/** Single-word vocabulary items that appear in a piece of Māori text. */
export function vocabIn(text: string, c: Content = content): VocabItem[] {
  const out = new Map<string, VocabItem>();
  for (const t of normMi(text.replace(/\{[^}]*\}/g, ' '), c.equivalents).split(' ')) {
    const v = c.vocabByForm.get(t);
    if (v) out.set(v.id, v);
  }
  return [...out.values()];
}

/** Up to n example sentences that use a vocabulary item. */
export function examplesFor(v: VocabItem, n = 2, c: Content = content) {
  const form = normMi(v.mi, c.equivalents);
  const out: { mi: string; en: string }[] = [];
  for (const p of c.patterns) for (const s of p.sentences) {
    if (out.length >= n) return out;
    if (s.mi.includes(' ') && (' ' + normMi(s.mi, c.equivalents) + ' ').includes(' ' + form + ' ')) out.push({ mi: s.mi, en: firstEn(s.en) });
  }
  return out;
}

/** First English reading of an authored "(a|b)" string, for display. */
export function firstEn(s: string): string {
  let t = s;
  for (let i = 0; i < 10 && /\([^()]*\|[^()]*\)/.test(t); i++) t = t.replace(/\(([^()|]*)\|[^()]*\)/, '$1');
  return t.replace(/\s+/g, ' ').trim();
}

/** Search words (Māori or English, macrons optional) and sentence patterns. Best matches first. */
export function searchContent(query: string, c: Content = content, limit = 40): { vocab: VocabItem[]; patterns: Pattern[] } {
  const q = stripMacrons(normMi(query));
  if (!q) return { vocab: [], patterns: [] };
  const fold = (s: string) => stripMacrons(normMi(s));
  const scored: { v: VocabItem; score: number }[] = [];
  for (const v of c.vocab) {
    const mi = [v.mi, ...v.altMi].map(fold);
    const en = v.en.map(fold);
    const score = mi.includes(q) || en.includes(q) ? 0 : mi.some((m) => m.startsWith(q)) || en.some((e) => e.startsWith(q)) ? 1 : mi.some((m) => m.includes(q)) || en.some((e) => e.includes(q)) ? 2 : -1;
    if (score >= 0) scored.push({ v, score });
  }
  return {
    vocab: scored.sort((a, b) => a.score - b.score).slice(0, limit).map((x) => x.v),
    patterns: c.patterns.filter((p) => fold(p.title + ' ' + p.structure).includes(q)),
  };
}
