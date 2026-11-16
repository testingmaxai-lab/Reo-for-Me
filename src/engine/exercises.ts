/** Turns a learning record (item + skill) into a concrete exercise. */
import { firstEn } from '../content';
import type { Content, Lang } from '../content/types';
import { resolveDeep, seeded, shuffle } from './deep';
import { expandAlternatives } from './normalize';
import type { Card } from './srs';

export type Skill = 'recognise' | 'produce' | 'understand' | 'apply' | 'recall' | 'meaning' | 'structure' | 'context';
export type Intensity = 'light' | 'standard' | 'intensive';
export const keyOf = (itemId: string, skill: Skill) => `${itemId}|${skill}`;
export const parseKey = (key: string) => { const i = key.lastIndexOf('|'); return { itemId: key.slice(0, i), skill: key.slice(i + 1) as Skill }; };

export interface Exercise {
  key: string;
  mode: 'type' | 'tiles' | 'self';
  instruction: string;
  prompt: string;
  promptLang: Lang;
  sub?: string;
  answers: string[];
  answerLang: Lang;
  looseEn?: boolean;
  tiles?: string[];
  reveal?: { label: string; text: string }[];
  explain?: string;
  concept?: { label: string; route: string };
  long?: boolean;
}

/** How many successful reviews before sentence-building tiles are withdrawn. */
export const SCAFFOLD_REPS: Record<Intensity, number> = { light: 3, standard: 2, intensive: 0 };

export interface GenContext {
  content: Content;
  intensity: Intensity;
  slots: Record<string, Record<string, string>>;
}

const words = (s: string) => s.replace(/[.,!?;:]/g, '').toLowerCase().split(/\s+/).filter(Boolean);

export function generate(key: string, card: Card | undefined, variant: number, ctx: GenContext): Exercise | null {
  const { itemId, skill } = parseKey(key);
  const c = ctx.content;

  const v = c.vocabById.get(itemId);
  if (v) {
    const concept = { label: v.mi, route: `#/explore/item/${encodeURIComponent(v.id)}` };
    if (skill === 'recognise') {
      if (v.selfCheck)
        return { key, mode: 'self', instruction: 'What does this mean? Say it to yourself, then check.', prompt: v.mi, promptLang: 'mi', answers: [], answerLang: 'en', reveal: [{ label: 'Meaning', text: v.en.join('; ') }, ...(v.note ? [{ label: 'Note', text: v.note }] : [])], concept };
      return { key, mode: 'type', instruction: 'Type the English meaning', prompt: v.mi, promptLang: 'mi', answers: v.en, answerLang: 'en', looseEn: true, explain: v.note, concept };
    }
    if (skill === 'produce')
      return { key, mode: 'type', instruction: 'Type the Māori', prompt: v.en.slice(0, 3).join('; '), promptLang: 'en', answers: [v.mi, ...v.altMi], answerLang: 'mi', explain: v.note, concept };
    return null;
  }

  const p = c.patternById.get(itemId);
  if (p) {
    const concept = { label: p.title, route: `#/explore/item/${encodeURIComponent(p.id)}` };
    if (skill === 'understand') {
      const s = p.sentences[variant % p.sentences.length];
      return { key, mode: 'type', instruction: 'Translate into English', prompt: s.mi, promptLang: 'mi', answers: [s.en], answerLang: 'en', explain: p.structure, concept };
    }
    if (skill === 'apply') {
      // construction and transformation exercises, interleaved
      const pool: ({ t: 's'; i: number } | { t: 't'; i: number })[] = [];
      p.sentences.forEach((_, i) => { pool.push({ t: 's', i }); if (i % 2 === 0 && p.transforms[i / 2]) pool.push({ t: 't', i: i / 2 }); });
      const pick = pool[variant % pool.length];
      if (pick.t === 't') {
        const t = p.transforms[pick.i];
        return { key, mode: 'type', instruction: t.instruction, prompt: t.from, promptLang: 'mi', sub: t.fromEn, answers: t.answers, answerLang: 'mi', explain: t.explain ?? p.structure, concept };
      }
      const s = p.sentences[pick.i];
      const ex: Exercise = { key, mode: 'type', instruction: 'Say it in Māori', prompt: firstEn(s.en), promptLang: 'en', sub: s.hint, answers: [s.mi], answerLang: 'mi', explain: p.structure, concept };
      const toks = words(s.mi);
      if ((card?.reps ?? 0) < SCAFFOLD_REPS[ctx.intensity] && toks.length >= 2) {
        const rng = seeded(variant * 7919 + toks.join('').length + 1);
        const others = [...new Set(p.sentences.flatMap((x) => words(x.mi)))].filter((w) => !toks.includes(w));
        ex.mode = 'tiles';
        ex.instruction = 'Build the sentence in Māori';
        ex.tiles = shuffle([...toks, ...shuffle(others, rng).slice(0, 2)], rng);
      }
      return ex;
    }
    return null;
  }

  const d = c.deepById.get(itemId);
  if (d) {
    const r = resolveDeep(d, ctx.slots[d.id]);
    if (!r.ready) return null;
    const concept = { label: d.title, route: `#/deep/${encodeURIComponent(d.id)}` };
    const en = r.lines.map((l) => l.en).join(' ');
    if (skill === 'recall')
      return { key, mode: 'type', long: true, instruction: d.kind === 'pepeha' ? 'Type your whole introduction from memory' : 'Type the whole text from memory', prompt: d.kind === 'pepeha' ? d.title : en, promptLang: 'en', answers: [r.text], answerLang: 'mi', concept };
    if (skill === 'meaning')
      return { key, mode: 'self', instruction: 'Explain what this means in your own words, then check.', prompt: r.text, promptLang: 'mi', answers: [], answerLang: 'en', concept,
        reveal: [{ label: 'Meaning', text: d.meaning }, ...(d.literal ? [{ label: 'Literally', text: d.literal }] : []), ...(d.nuances ? [{ label: 'Notes on interpretation', text: d.nuances }] : [])] };
    if (skill === 'context')
      return { key, mode: 'self', instruction: 'Where does this come from, and when is it appropriate to use? Then check.', prompt: r.text, promptLang: 'mi', answers: [], answerLang: 'en', concept,
        reveal: [{ label: 'Background', text: d.provenance }, { label: 'Context', text: d.context }, { label: 'Use', text: d.usage }] };
    if (skill === 'structure' && d.structureQs.length) {
      const q = d.structureQs[variant % d.structureQs.length];
      return { key, mode: 'type', instruction: q.prompt, prompt: r.text, promptLang: 'mi', answers: q.answers, answerLang: q.lang, looseEn: q.lang === 'en', explain: q.explain, concept };
    }
  }
  return null;
}

/** The display form of the main expected answer. */
export const primaryAnswer = (ex: Exercise) => expandAlternatives(ex.answers[0] ?? '')[0] ?? '';
