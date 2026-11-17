import { describe, expect, it } from 'vitest';
import { buildContent, content, examplesFor, firstEn, searchContent, validateContent, vocabIn } from '../content';
import { greeting, maoriDate, shortDay } from './dates';
import { deepMastery, makeClozes, orderTiles, resolveDeep, seeded } from './deep';
import { generate, keyOf, type GenContext } from './exercises';
import { checkAnswer, diffExpected, editDistance, expandAlternatives, hintFor, normEn, normMi } from './normalize';
import { activity, doneToday, forecast, summary } from './progress';
import { buildDiagnostic, nextNew, scoreDiagnostic, units, unmetPrereqs, weakAreas } from './recommend';
import { buildLearnSteps, buildReviewSteps, requeue } from './session';
import { applyReview, DAY, isDue, MIN, retrievability, sm2, strength, type Card } from './srs';

const opts = { equivalents: content.equivalents, lexicon: content.lexicon };
const NOW = new Date(2026, 10, 16, 9, 0).getTime();
const ctx: GenContext = { content, intensity: 'standard', slots: {} };

describe('content', () => {
  it('passes validation', () => expect(validateContent(content)).toEqual([]));
  it('meets the initial content targets', () => {
    expect(content.vocab.length).toBeGreaterThanOrEqual(100);
    expect(content.patterns.length).toBeGreaterThanOrEqual(10);
    expect(content.deep.filter((d) => d.kind === 'whakatauki').length).toBe(2);
    expect(content.deep.filter((d) => d.kind === 'pepeha').length).toBe(1);
    expect(content.deep.filter((d) => d.kind === 'karakia').length).toBe(0); // deliberately empty
  });
  it('labels nothing as verified that has not been reviewed', () => {
    expect(content.vocab.every((v) => v.status !== 'verified')).toBe(true);
  });
  it('every sentence is accepted by its own answer key, in both directions', () => {
    for (const p of content.patterns) for (const s of p.sentences) {
      expect(checkAnswer(s.mi, [s.mi], 'mi', opts).verdict, s.mi).toBe('correct');
      expect(checkAnswer(firstEn(s.en), [s.en], 'en').verdict, s.en).toBe('correct');
    }
  });
  it('every word used in sentences and transforms is spelled consistently with the vocabulary', () => {
    // a sentence word that differs from a vocab word only by macrons is almost certainly a typo
    const bare = new Map(content.vocab.filter((v) => !v.mi.includes(' ')).map((v) => [v.mi.normalize('NFD').replace(/̄/g, ''), v.mi]));
    const allowed = new Set(['tō', 'to', 'ō', 'o', 'ana', 'tana', 'kia', 'ka', 'ki', 'i', 'e', 'he', 'te', 'ko', 'mai', 'anō', 'matua', 'mātua']);
    for (const p of content.patterns) for (const s of p.sentences) for (const w of normMi(s.mi).split(' ')) {
      const b = w.normalize('NFD').replace(/̄/g, '');
      if (bare.has(b) && !allowed.has(w)) expect(w, `${s.mi}`).toBe(bare.get(b));
    }
  });
  it('detects problems in bad content', () => {
    const bad = buildContent({ vocab: { topics: [{ id: 't', title: 'T', items: [{ mi: 'kai', en: [] }, { mi: 'kai', en: ['food'] }] }] }, grammar: { patterns: [{ id: 'x', title: 'X', prereqs: ['nope'] }] }, deep: { items: [] }, equivalents: {} });
    const errs = validateContent(bad).join('\n');
    expect(errs).toMatch(/Duplicate id/);
    expect(errs).toMatch(/at least one English meaning/);
    expect(errs).toMatch(/unknown prerequisite/);
  });
  it('links vocabulary to the texts it appears in', () => {
    const d = content.deepById.get('d:he-tangata')!;
    const ids = vocabIn(d.lines.map((l) => l.mi).join(' ')).map((v) => v.id);
    expect(ids).toEqual(expect.arrayContaining(['v:aha', 'v:mea', 'v:nui', 'v:ao', 'v:tangata']));
    expect(examplesFor(content.vocabById.get('v:kurī')!).length).toBeGreaterThan(0);
  });
});

describe('answer validation', () => {
  it('accepts the expected answer regardless of case, spacing and punctuation', () => {
    expect(checkAnswer('  kei te HAERE au ', ['Kei te haere au.'], 'mi', opts).verdict).toBe('correct');
  });
  it('accepts listed alternatives and reports them as alternatives', () => {
    expect(checkAnswer('ata mārie', ['mōrena', 'ata mārie'], 'mi', opts).verdict).toBe('alternative');
    expect(checkAnswer('thanks', ['hello', 'thanks'], 'en').verdict).toBe('alternative');
  });
  it('treats au and ahau as the same word', () => {
    expect(checkAnswer('Kei te haere ahau', ['Kei te haere au.'], 'mi', opts).verdict).toBe('correct');
  });
  it('flags a missing macron as a macron error, not as correct and not as wrong', () => {
    const r = checkAnswer('kuri', ['kurī'], 'mi', opts);
    expect(r.verdict).toBe('macron');
    expect(r.note).toContain('kurī');
  });
  it('flags an added macron as a macron error', () => {
    expect(checkAnswer('mātua', ['matua'], 'mi', opts).verdict).toBe('macron');
  });
  it('flags macron errors inside sentences and names the word', () => {
    const r = checkAnswer('Kaore au i te haere', ['Kāore au i te haere.'], 'mi', opts);
    expect(r.verdict).toBe('macron');
    expect(r.note).toContain('kāore');
  });
  it('accepts double-vowel spelling as an orthographic variant', () => {
    expect(checkAnswer('kurii', ['kurī'], 'mi', opts).verdict).toBe('correct');
    expect(checkAnswer('Maaori', ['Māori'], 'mi', opts).verdict).toBe('correct');
  });
  it('accepts macrons typed as combining characters', () => {
    expect(checkAnswer('kurī', ['kurī'], 'mi', opts).verdict).toBe('correct');
  });
  it('forgives a one-letter slip in a long word', () => {
    expect(checkAnswer('whakarogno', ['whakarongo'], 'mi', opts).verdict).toBe('typo');
    expect(checkAnswer('beautifull', ['beautiful'], 'en').verdict).toBe('typo');
  });
  it('does not forgive a slip that produces a different real word', () => {
    expect(checkAnswer('māua', ['tāua'], 'mi', opts).verdict).toBe('wrong');
    expect(checkAnswer('Kei te haere mātou', ['Kei te haere rātou.'], 'mi', opts).verdict).toBe('wrong');
    expect(checkAnswer('kai', ['kei'], 'mi', opts).verdict).toBe('wrong');
  });
  it('marks a substantive error wrong and notes word-order problems', () => {
    expect(checkAnswer('Kei te moe au', ['Kei te haere au.'], 'mi', opts).verdict).toBe('wrong');
    expect(checkAnswer('Kei te au haere', ['Kei te haere au.'], 'mi', opts).note).toMatch(/word order/);
    expect(checkAnswer('', ['kai'], 'mi', opts).verdict).toBe('wrong');
  });
  it('expands authored alternatives', () => {
    expect(expandAlternatives('(She|He) is (talking|speaking).')).toHaveLength(4);
    expect(expandAlternatives('that (near you)')).toEqual(['that (near you)']);
    expect(checkAnswer('he is speaking', ['(She|He) is (talking|speaking).'], 'en').verdict).toBe('alternative');
    expect(checkAnswer('She is talking', ['(She|He) is (talking|speaking).'], 'en').verdict).toBe('correct');
  });
  it('handles English contractions, clarifiers and leading articles', () => {
    expect(normEn("I'm not going")).toBe('i am not going');
    expect(normEn("It's fine.")).toBe('it is fine');
    expect(checkAnswer("I didn't go", ['I did not go.'], 'en').verdict).toBe('correct');
    expect(checkAnswer('that', ['that (near you)'], 'en', { looseEn: true }).verdict).toBe('correct');
    expect(checkAnswer('to eat', ['eat', 'food'], 'en', { looseEn: true }).verdict).toBe('correct');
    expect(checkAnswer('a dog', ['dog'], 'en', { looseEn: true }).verdict).toBe('correct');
  });
  it('does not confuse singular and plural', () => {
    expect(checkAnswer('the house', ['the houses'], 'en').verdict).toBe('wrong');
  });
  it('computes edit distance with transpositions', () => {
    expect(editDistance('abcd', 'abdc')).toBe(1);
    expect(editDistance('kitten', 'sitting')).toBe(3);
  });
});

describe('spaced repetition', () => {
  it('schedules a new item for tomorrow after a correct answer, then widens the gap', () => {
    let c = sm2.next(undefined, 'k', 'good', NOW);
    expect(c.state).toBe('review');
    expect(c.interval).toBe(1);
    expect(isDue(c, NOW)).toBe(false);
    expect(isDue(c, NOW + DAY)).toBe(true);
    c = sm2.next(c, 'k', 'good', NOW + DAY);
    expect(c.interval).toBe(3);
    c = sm2.next(c, 'k', 'good', NOW + 4 * DAY);
    expect(c.interval).toBe(8);
    c = sm2.next(c, 'k', 'good', NOW + 12 * DAY);
    expect(c.interval).toBe(20);
  });
  it('brings a failed new item back within the session and does not graduate it', () => {
    const c = sm2.next(undefined, 'k', 'again', NOW);
    expect(c.state).toBe('learning');
    expect(c.due).toBe(NOW + 10 * MIN);
    expect(c.reps).toBe(0);
    expect(sm2.next(c, 'k', 'good', NOW + 10 * MIN).interval).toBe(1);
  });
  it('shortens the interval and lowers ease after a lapse', () => {
    let c: Card = { key: 'k', state: 'review', ease: 2.5, interval: 20, due: NOW, reps: 4, lapses: 0, n: 4, first: 0, last: NOW - 20 * DAY };
    c = sm2.next(c, 'k', 'again', NOW);
    expect(c.state).toBe('learning');
    expect(c.lapses).toBe(1);
    expect(c.interval).toBe(5);
    expect(c.ease).toBeCloseTo(2.3);
    expect(sm2.next(c, 'k', 'good', NOW + 10 * MIN).interval).toBe(5);
  });
  it('grows the interval only slightly after a near miss', () => {
    const c: Card = { key: 'k', state: 'review', ease: 2.5, interval: 10, due: NOW, reps: 3, lapses: 0, n: 3, first: 0, last: NOW - 10 * DAY };
    expect(sm2.next(c, 'k', 'hard', NOW).interval).toBe(12);
    expect(sm2.next(c, 'k', 'good', NOW).interval).toBe(25);
    expect(sm2.next(c, 'k', 'easy', NOW).interval).toBeGreaterThan(25);
  });
  it('lets a learner who already knows an item skip ahead', () => {
    expect(sm2.next(undefined, 'k', 'easy', NOW).interval).toBe(7);
  });
  it('never exceeds the maximum interval and never drops ease below the floor', () => {
    let c = sm2.next(undefined, 'k', 'easy', NOW);
    for (let i = 0; i < 20; i++) c = sm2.next(c, 'k', 'easy', c.due);
    expect(c.interval).toBe(365);
    for (let i = 0; i < 20; i++) c = sm2.next(sm2.next(c, 'k', 'again', c.due), 'k', 'good', c.due);
    expect(c.ease).toBe(1.3);
  });
  it('does not inflate the schedule when practising ahead, but still counts a failure', () => {
    const c = sm2.next(undefined, 'k', 'good', NOW);
    const early = applyReview(c, 'k', 'good', NOW + MIN);
    expect(early.interval).toBe(c.interval);
    expect(early.due).toBe(c.due);
    expect(applyReview(c, 'k', 'again', NOW + MIN).state).toBe('learning');
  });
  it('classifies strength in coarse buckets', () => {
    expect(strength(undefined)).toBe('new');
    expect(strength({ interval: 3, state: 'review' } as Card)).toBe('learning');
    expect(strength({ interval: 8, state: 'review' } as Card)).toBe('familiar');
    expect(strength({ interval: 30, state: 'review' } as Card)).toBe('strong');
    expect(strength({ interval: 30, state: 'learning' } as Card)).toBe('learning');
  });
  it('estimates retention at about 90% when a review falls due', () => {
    expect(retrievability({ interval: 10, last: NOW - 10 * DAY, state: 'review' } as Card, NOW)).toBeCloseTo(0.9);
  });
  it('tracks skills independently', () => {
    const cards: Record<string, Card> = {};
    cards['v:kurī|recognise'] = applyReview(undefined, 'v:kurī|recognise', 'good', NOW);
    cards['v:kurī|produce'] = applyReview(undefined, 'v:kurī|produce', 'again', NOW);
    cards['p:kei-te|apply'] = applyReview(undefined, 'p:kei-te|apply', 'again', NOW);
    expect(cards['v:kurī|recognise'].state).toBe('review'); // failing the sentence did not touch the word
    expect(cards['v:kurī|produce'].state).toBe('learning');
  });
});

describe('exercises and sessions', () => {
  it('generates the four core exercise types', () => {
    const rec = generate('v:kurī|recognise', undefined, 0, ctx)!;
    expect(rec.prompt).toBe('kurī');
    expect(rec.answerLang).toBe('en');
    const pro = generate('v:kurī|produce', undefined, 0, ctx)!;
    expect(pro.prompt).toBe('dog');
    expect(pro.answers[0]).toBe('kurī');
    const und = generate('p:kei-te|understand', undefined, 0, ctx)!;
    expect(und.promptLang).toBe('mi');
    const con = generate('p:kei-te|apply', undefined, 0, ctx)!;
    expect(con.answerLang).toBe('mi');
    const tr = generate('p:kei-te|apply', undefined, 1, ctx)!;
    expect(tr.instruction).toMatch(/Change the subject/);
    expect(generate('v:nope|recognise', undefined, 0, ctx)).toBeNull();
  });
  it('gives scaffolding to beginners and withdraws it with proficiency or at intensive pace', () => {
    const fresh = generate('p:kei-te|apply', undefined, 0, ctx)!;
    expect(fresh.mode).toBe('tiles');
    expect(fresh.tiles).toEqual(expect.arrayContaining(['kei', 'te', 'haere', 'au']));
    expect(generate('p:kei-te|apply', { reps: 2 } as Card, 0, ctx)!.mode).toBe('type');
    expect(generate('p:kei-te|apply', undefined, 0, { ...ctx, intensity: 'intensive' })!.mode).toBe('type');
  });
  it('rotates sentences so a pattern is applied in new contexts', () => {
    const prompts = new Set([0, 1, 2, 3, 4].map((n) => generate('p:kei-te|understand', undefined, n, ctx)!.prompt));
    expect(prompts.size).toBe(5);
  });
  it('uses self-assessment where a typed meaning cannot be checked reliably', () => {
    expect(generate('v:tāua|recognise', undefined, 0, ctx)!.mode).toBe('self');
  });
  it('builds a learn session as introduce, retrieve, then apply later', () => {
    const steps = buildLearnSteps(['v:kurī', 'v:ngeru', 'p:kei-te'], content);
    expect(steps[0]).toEqual({ t: 'intro', itemId: 'v:kurī' });
    expect(steps[1]).toMatchObject({ key: 'v:kurī|recognise' });
    const idx = (k: string) => steps.findIndex((s) => s.t === 'ex' && s.key === k);
    expect(idx('v:kurī|produce')).toBeGreaterThan(idx('v:ngeru|recognise'));
    expect(steps.filter((s) => s.t === 'ex' && s.key === 'p:kei-te|apply')).toHaveLength(2);
    expect(buildLearnSteps(['v:kurī'], content, false).some((s) => s.t === 'intro')).toBe(false);
  });
  it('re-queues a failed exercise later in the same session', () => {
    const steps = buildLearnSteps(['v:kurī', 'v:ngeru', 'v:whare'], content);
    const out = requeue(steps, 1);
    expect(out.length).toBe(steps.length + 1);
    expect(out[5]).toMatchObject({ key: 'v:kurī|recognise', retry: true });
  });
  it('reviews only what is due, most overdue first, up to the session size', () => {
    const cards: Record<string, Card> = {
      a: { ...sm2.next(undefined, 'v:kurī|recognise', 'good', NOW - 5 * DAY) },
      b: { ...sm2.next(undefined, 'v:ngeru|recognise', 'good', NOW - 2 * DAY) },
      c: { ...sm2.next(undefined, 'v:whare|recognise', 'easy', NOW) },
      d: { ...sm2.next(undefined, 'v:deleted|recognise', 'good', NOW - 9 * DAY) },
    };
    const byKey = Object.fromEntries(Object.values(cards).map((c) => [c.key, c]));
    const steps = buildReviewSteps(byKey, content, NOW, 20);
    expect(steps.map((s) => (s as any).key)).toEqual(['v:kurī|recognise', 'v:ngeru|recognise']);
    expect(buildReviewSteps(byKey, content, NOW, 1)).toHaveLength(1);
  });
});

describe('curriculum recommendations', () => {
  it('orders the pathway by level and mixes vocabulary with patterns', () => {
    const u = units(content);
    expect(u[0].level).toBe(1);
    expect(u.map((x) => x.level)).toEqual([...u.map((x) => x.level)].sort());
    expect(u.filter((x) => x.level === 1).some((x) => x.kind === 'pattern')).toBe(true);
  });
  it('recommends the first unlearned material and moves on as items are introduced', () => {
    const first = nextNew(content, {}, { count: 5 });
    expect(first.itemIds).toHaveLength(5);
    expect(first.testOut).toBe(false);
    const cards = Object.fromEntries(first.itemIds.map((id) => [keyOf(id, 'recognise'), sm2.next(undefined, keyOf(id, 'recognise'), 'good', NOW)]));
    const second = nextNew(content, cards, { count: 5 });
    expect(second.itemIds.some((id) => first.itemIds.includes(id))).toBe(false);
  });
  it('starts at the chosen level and offers earlier material as a quick check afterwards', () => {
    const r = nextNew(content, {}, { count: 5, startLevel: 2 });
    expect(r.unit!.level).toBe(2);
    const all: Record<string, Card> = {};
    for (const u of units(content).filter((u) => u.level >= 2)) for (const id of u.itemIds) {
      const k = keyOf(id, id.startsWith('p:') ? 'understand' : 'recognise');
      all[k] = sm2.next(undefined, k, 'good', NOW);
    }
    const back = nextNew(content, all, { count: 5, startLevel: 2 });
    expect(back.testOut).toBe(true);
    expect(back.unit!.level).toBe(1);
  });
  it('puts queued words (e.g. from a whakataukī) first', () => {
    expect(nextNew(content, {}, { count: 3, queue: ['v:ao', 'v:mea'] }).itemIds).toEqual(['v:ao', 'v:mea']);
  });
  it('allows any topic to be started immediately', () => {
    const r = nextNew(content, {}, { count: 2, within: ['p:negation'] });
    expect(r.itemIds).toEqual(['p:negation']);
    expect(unmetPrereqs('p:negation', content, {}).length).toBeGreaterThan(0); // advice only
  });
  it('scores the diagnostic into a starting level', () => {
    const mk = (l1: number, l2: number, l3: number) => [1, 2, 3].flatMap((level, i) => Array.from({ length: 5 }, (_, j) => ({ level, correct: j < [l1, l2, l3][i] })));
    expect(scoreDiagnostic(mk(1, 0, 0), NOW).recommendedLevel).toBe(1);
    expect(scoreDiagnostic(mk(5, 2, 0), NOW).recommendedLevel).toBe(2);
    expect(scoreDiagnostic(mk(4, 4, 1), NOW).recommendedLevel).toBe(3);
    expect(scoreDiagnostic(mk(5, 5, 5), NOW).recommendedLevel).toBe(3);
  });
  it('builds a diagnostic that samples every level with answerable questions', () => {
    const qs = buildDiagnostic(content, seeded(42));
    expect(new Set(qs.map((q) => q.level))).toEqual(new Set([1, 2, 3]));
    expect(qs.length).toBe(15);
    for (const q of qs) expect(generate(q.step.key, undefined, q.step.variant ?? 0, { ...ctx, intensity: 'intensive' })?.mode).toBe('type');
  });
  it('reports areas needing attention', () => {
    let c = sm2.next(undefined, 'v:kurī|produce', 'good', NOW);
    c = sm2.next(c, c.key, 'again', NOW + DAY);
    c = sm2.next(c, c.key, 'good', NOW + DAY);
    c = sm2.next(c, c.key, 'again', NOW + 2 * DAY);
    expect(weakAreas(content, { [c.key]: c })[0]).toMatchObject({ label: 'kurī', skill: 'produce' });
    expect(weakAreas(content, {})).toEqual([]);
  });
  it('summarises progress without overstating it', () => {
    const k = 'v:kurī|recognise';
    const s = summary(content, { [k]: sm2.next(undefined, k, 'good', NOW) }, [{ t: NOW, key: k, grade: 'good', verdict: 'correct' }], NOW);
    expect(s.recognise.learning).toBe(1);
    expect(s.recognise.new).toBe(content.vocab.length - 1);
    expect(s.produce.new).toBe(content.vocab.length);
    expect(s.retention).toBeNull(); // too little data to estimate
    expect(s.accuracyThisWeek).toBeNull();
  });
});

describe('deep learning', () => {
  const tangata = content.deepById.get('d:he-tangata')!;
  const pepeha = content.deepById.get('d:pepeha-tauiwi')!;
  it('resolves fixed texts as they are', () => {
    const r = resolveDeep(tangata);
    expect(r.ready).toBe(true);
    expect(r.text).toBe('He aha te mea nui o te ao? He tangata, he tangata, he tangata.');
  });
  it('never invents pepeha details: nothing is ready until the learner supplies their own', () => {
    const empty = resolveDeep(pepeha, {});
    expect(empty.ready).toBe(false);
    expect(empty.missing).toEqual(['origin', 'born', 'home', 'name']);
    expect(generate('d:pepeha-tauiwi|recall', undefined, 0, ctx)).toBeNull();
    const r = resolveDeep(pepeha, { origin: 'Ingarangi', born: 'Ōtautahi', home: 'Pōneke', name: 'Max' });
    expect(r.ready).toBe(true);
    expect(r.text).toContain('Nō Ingarangi ōku tūpuna.');
    expect(r.text).not.toContain('tipu ake'); // optional line omitted
    expect(r.text).not.toContain('tohu o nehe');
  });
  it('makes missing-word exercises from the fixed text only', () => {
    const vals = { origin: 'Ingarangi', born: 'Ōtautahi', home: 'Pōneke', name: 'Max' };
    const cl = makeClozes(pepeha, vals, 20, seeded(3));
    expect(cl.length).toBeGreaterThan(5);
    for (const c of cl) {
      expect(c.display).toContain('_____');
      expect(Object.values(vals)).not.toContain(c.answer);
    }
    const one = makeClozes(tangata, {}, 3, seeded(1));
    expect(one).toHaveLength(3);
    expect(one[0].display.replace('_____', one[0].answer)).toMatch(/^He /);
  });
  it('orders words for short texts and lines for long ones', () => {
    expect(orderTiles(resolveDeep(tangata)).length).toBe(14);
    expect(orderTiles(resolveDeep(pepeha, { origin: 'a', born: 'b', home: 'c', name: 'd' })).length).toBe(5);
  });
  it('tracks four dimensions and reports the weakest as the overall level', () => {
    const cards: Record<string, Card> = {};
    expect(deepMastery(tangata.id, cards).overall).toBe('not started');
    cards[`${tangata.id}|recall`] = { interval: 40, state: 'review' } as Card;
    let m = deepMastery(tangata.id, cards);
    expect(m.dimensions.recall).toBe('strong');
    expect(m.overall).toBe('not started'); // memorised wording alone is not mastery
    for (const d of ['meaning', 'structure', 'context']) cards[`${tangata.id}|${d}`] = { interval: 10, state: 'review' } as Card;
    m = deepMastery(tangata.id, cards);
    expect(m.overall).toBe('developing');
    expect(m.dimensions.meaning).toBe('developing');
  });
  it('generates review exercises for each dimension', () => {
    expect(generate('d:he-tangata|recall', undefined, 0, ctx)!.answers[0]).toContain('He tangata');
    expect(generate('d:he-tangata|meaning', undefined, 0, ctx)!.mode).toBe('self');
    expect(generate('d:he-tangata|context', undefined, 0, ctx)!.reveal![0].text).toContain('Meri Ngāroto');
    const q = generate('d:he-tangata|structure', undefined, 2, ctx)!;
    expect(checkAnswer('o', q.answers, q.answerLang, opts).verdict).toBe('correct');
  });
  it('accepts a full recall with punctuation differences and flags macron slips', () => {
    const text = resolveDeep(content.deepById.get('d:whaia-te-iti-kahurangi')!).text;
    expect(checkAnswer('whāia te iti kahurangi ki te tūohu koe me he maunga teitei', [text], 'mi', opts).verdict).toBe('correct');
    expect(checkAnswer('whaia te iti kahurangi ki te tuohu koe me he maunga teitei', [text], 'mi', opts).verdict).toBe('macron');
  });
});

describe('feedback helpers', () => {
  it('marks which words of the expected answer were missing or wrong', () => {
    const d = diffExpected('Kei te moe au', 'Kei te haere au.', 'mi', content.equivalents);
    expect(d.map((x) => x.ok)).toEqual([true, true, false, true]);
    expect(d[2].word).toBe('haere');
    // a macron slip is highlighted on the word concerned
    expect(diffExpected('Kaore ahau i te haere', 'Kāore au i te haere.', 'mi', content.equivalents).map((x) => x.ok)).toEqual([false, true, true, true, true]);
    // word order: only words in the right relative order count
    expect(diffExpected('au haere', 'haere au', 'mi').filter((x) => x.ok)).toHaveLength(1);
    expect(diffExpected('', 'haere au', 'mi').every((x) => !x.ok)).toBe(true);
  });
  it('gives a hint that does not reveal the answer', () => {
    expect(hintFor('kurī')).toBe('k · · ·');
    expect(hintFor('Kei te haere au.')).toBe('Kei … (4 words)');
  });
});

describe('search', () => {
  it('finds words by Māori with or without macrons, and by English', () => {
    expect(searchContent('kuri').vocab[0].mi).toBe('kurī');
    expect(searchContent('KURĪ').vocab[0].mi).toBe('kurī');
    expect(searchContent('dog').vocab[0].mi).toBe('kurī');
    expect(searchContent('wha').vocab.map((v) => v.mi)).toEqual(expect.arrayContaining(['whā', 'whare', 'whānau', 'whaea']));
    expect(searchContent('zzz').vocab).toEqual([]);
    expect(searchContent('  ').vocab).toEqual([]);
  });
  it('puts exact matches first and finds patterns', () => {
    expect(searchContent('kai').vocab[0].mi).toBe('kai');
    expect(searchContent('kāore').patterns[0].id).toBe('p:negation');
  });
});

describe('forecast and activity', () => {
  it('counts reviews falling due per day, with overdue items under today', () => {
    const cards: Record<string, Card> = {};
    const add = (k: string, t: number, g: 'good' | 'easy') => { cards[k] = sm2.next(undefined, k, g, t); };
    add('v:kurī|recognise', NOW - 5 * DAY, 'good'); // overdue
    add('v:ngeru|recognise', NOW, 'good');          // tomorrow
    add('v:whare|recognise', NOW, 'easy');          // in 7 days: outside a 7-day window
    add('v:gone|recognise', NOW, 'good');           // no longer in the content
    expect(forecast(content, cards, NOW, 7)).toEqual([1, 1, 0, 0, 0, 0, 0]);
    expect(forecast(content, cards, NOW, 8)[7]).toBe(1);
  });
  it('counts answers per day, ending today', () => {
    const r = (t: number) => ({ t, key: 'k|x', grade: 'good' as const, verdict: 'correct' });
    const a = activity([r(NOW), r(NOW - 1000), r(NOW - DAY), r(NOW - 20 * DAY)], NOW, 14);
    expect(a).toHaveLength(14);
    expect(a[13]).toBe(2);
    expect(a[12]).toBe(1);
    expect(a.reduce((x, y) => x + y)).toBe(3);
    expect(doneToday([r(NOW), r(NOW - DAY)], NOW)).toBe(1);
  });
});

describe('dates in te reo', () => {
  it('names the day and month', () => {
    expect(maoriDate(new Date(2026, 10, 17).getTime())).toBe('Rātū, 17 Whiringa-ā-rangi'); // Tuesday 17 November
    expect(maoriDate(new Date(2027, 0, 3).getTime())).toBe('Rātapu, 3 Kohitātea');        // Sunday 3 January
    expect(shortDay(new Date(2026, 10, 16).getTime())).toBe('Hina');
    expect(greeting(new Date(2026, 10, 17, 8).getTime())).toBe('Ata mārie');
    expect(greeting(new Date(2026, 10, 17, 15).getTime())).toBe('Kia ora');
  });
});
