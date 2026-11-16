import { useMemo, useState } from 'react';
import { content, vocabIn } from '../content';
import type { DeepItem } from '../content/types';
import { DEEP_DIMENSIONS, DEEP_STAGES, DIMENSION_LABEL, deepMastery, makeClozes, orderTiles, resolveDeep, seeded, shuffle, type Resolved } from '../engine/deep';
import { generate, keyOf, type Exercise } from '../engine/exercises';
import { isIntroduced } from '../engine/recommend';
import { strength } from '../engine/srs';
import { getState, review, setKV, useAppState } from '../store/state';
import { startPractice } from './actions';
import { AnswerInput, Button, Card, Dot, H2, List, Muted, Reo, Row, StatusBadge } from './components';
import { ExerciseView, type Outcome } from './ExerciseView';
import { go } from './router';

const enc = encodeURIComponent;
const KIND = { whakatauki: 'Whakataukī', karakia: 'Karakia', pepeha: 'Pepeha' };

function Text({ r }: { r: Resolved }) {
  return <div className="space-y-3">{r.lines.map((l, i) => <p key={i}><Reo className="text-xl font-semibold leading-snug">{l.mi}</Reo><br /><span className="text-muted">{l.en}</span></p>)}</div>;
}
const Section = ({ label, text }: { label: string; text?: string }) => (text ? <div className="mt-4"><div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div><p className="mt-1 leading-relaxed"><Reo>{text}</Reo></p></div> : null);

/** The learner's own details. The app never suggests or fills in places, people or connections. */
function SlotForm({ item }: { item: DeepItem }) {
  const { kv } = useAppState();
  const values = kv.slots[item.id] ?? {};
  return (
    <Card className="mt-4 space-y-4">
      <p className="font-semibold">Your details</p>
      <Muted>Only you can supply these. Nothing is filled in for you, and they are stored only on this device.</Muted>
      {item.slots!.map((s) => (
        <div key={s.id}>
          <label className="mb-1 block text-sm font-medium">{s.label}{s.optional ? ' (optional)' : ''}</label>
          <AnswerInput lang="mi" autoFocus={false} label={s.label} value={values[s.id] ?? ''} onChange={(v) => setKV('slots', { ...getState().kv.slots, [item.id]: { ...(getState().kv.slots[item.id] ?? {}), [s.id]: v } })} />
          {s.hint && <Muted className="mt-1">{s.hint}</Muted>}
        </div>
      ))}
    </Card>
  );
}

/** Runs a fixed list of exercises; anything missed comes round again until it is right. Not scheduled. */
function StageRunner({ exercises, onComplete }: { exercises: Exercise[]; onComplete: () => void }) {
  const [queue, setQueue] = useState(exercises);
  const [n, setN] = useState(0);
  if (!queue.length) return <div><p className="text-lg font-semibold">Stage complete.</p><Button full className="mt-4" autoFocus onClick={onComplete}>Continue</Button></div>;
  const done = (o: Outcome) => { setQueue((q) => (o.grade === 'again' ? [...q.slice(1), q[0]] : q.slice(1))); setN(n + 1); };
  return <div><Muted className="mb-3">{queue.length} to go</Muted><ExerciseView key={n} ex={queue[0]} onDone={done} allowEasy={false} /></div>;
}

export function Deep({ id }: { id: string }) {
  const item = content.deepById.get(id);
  const { kv, cards } = useAppState();
  const [open, setOpen] = useState<number | null>(null);
  const [attempt, setAttempt] = useState(0);
  const values = item ? kv.slots[item.id] ?? {} : {};
  const r = useMemo(() => (item ? resolveDeep(item, values) : null), [item, values]);
  const stageExercises = useMemo(() => {
    if (!item || !r?.ready || open === null) return [];
    const ctx = { content, intensity: getState().kv.settings.intensity, slots: getState().kv.slots };
    if (open === 1) return item.structureQs.map((_, i) => generate(keyOf(item.id, 'structure'), undefined, i, ctx)!).filter(Boolean);
    if (open === 2) {
      const rng = seeded(Date.now());
      const en = r.lines.map((l) => l.en).join(' ');
      const clozes: Exercise[] = makeClozes(item, values, 4, rng).map((c) => ({ key: '', mode: 'type', instruction: 'Fill in the missing word', prompt: c.display, promptLang: 'mi', sub: c.en, answers: [c.answer], answerLang: 'mi' }));
      const tiles = orderTiles(r);
      return [...clozes, { key: '', mode: 'tiles', instruction: 'Put it back in order', prompt: en, promptLang: 'en', answers: [r.text], answerLang: 'mi', tiles: shuffle(tiles, rng) } as Exercise];
    }
    return [];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, item, r?.ready]);

  if (!item || !r) return <a href="#/explore" className="text-accent">‹ Explore</a>;
  const prog = kv.deep[item.id];
  const stage = prog?.stage ?? 0;
  const complete = (n: number) => {
    const d = getState().kv.deep;
    setKV('deep', { ...d, [item.id]: { ...d[item.id], startedAt: d[item.id]?.startedAt ?? Date.now(), stage: Math.max(d[item.id]?.stage ?? 0, n + 1), ...(n === 3 ? { completedAt: Date.now() } : {}) } });
    setOpen(n < 3 ? n + 1 : null);
    window.scrollTo(0, 0);
  };
  const words = vocabIn(r.text);
  const newWords = words.filter((v) => !isIntroduced(v.id, cards) && !kv.queue.includes(v.id));
  const mastery = deepMastery(item.id, cards);
  const needsDetails = !!item.slots && !r.ready;

  const head = (
    <div className="mb-4">
      <button type="button" className="mb-3 text-sm font-semibold text-accent" onClick={() => (open === null ? go('/explore') : setOpen(null))}>‹ {open === null ? 'Explore' : item.title}</button>
      <p className="text-sm font-medium text-muted">{KIND[item.kind]}{open !== null ? ` · Stage ${open + 1}: ${DEEP_STAGES[open]}` : ''}</p>
    </div>
  );

  if (open === 0) return (
    <div>{head}
      <Text r={r} />
      {item.slots && <SlotForm item={item} />}
      <Section label="Background" text={item.provenance} />
      <Section label="Context" text={item.context} />
      <Section label="Appropriate use" text={item.usage} />
      <div className="mt-4"><StatusBadge status={item.status} source={item.source} /></div>
      <Muted className="mt-3">No audio is included: there is no properly licensed recording to bundle. Ask a fluent speaker or kaiako to model the pronunciation.</Muted>
      <Button full className="mt-6" disabled={needsDetails} onClick={() => complete(0)}>{needsDetails ? 'Fill in your details to continue' : 'Continue to Understand'}</Button>
    </div>
  );

  if (open === 1) return (
    <div>{head}
      {attempt === 0 ? (
        <>
          <Text r={r} />
          <Section label="Meaning" text={item.meaning} />
          <Section label="Literally" text={item.literal} />
          <H2>Piece by piece</H2>
          <List>{item.components.map((c, i) => <Row key={i} lang="mi" title={c.mi} sub={<span lang="en">{c.gloss}{c.note ? ` — ${c.note}` : ''}</span>} onClick={c.pattern ? () => go(`/explore/item/${enc(c.pattern!)}`) : undefined} />)}</List>
          <Section label="Notes on interpretation" text={item.nuances} />
          {words.length > 0 && (
            <>
              <H2>Words from your vocabulary</H2>
              <List>{words.map((v) => <Row key={v.id} lang="mi" title={v.mi} sub={<span lang="en">{v.en.slice(0, 2).join('; ')}</span>} right={<Dot s={strength(cards[keyOf(v.id, 'recognise')])} />} onClick={() => go(`/explore/item/${enc(v.id)}`)} />)}</List>
              {newWords.length > 0 && <Button full variant="secondary" className="mt-3" onClick={() => setKV('queue', [...getState().kv.queue, ...newWords.map((v) => v.id)])}>Add {newWords.length} new word{newWords.length > 1 ? 's' : ''} to my next lesson</Button>}
            </>
          )}
          <Button full className="mt-6" disabled={needsDetails} onClick={() => setAttempt(1)}>Check my understanding</Button>
        </>
      ) : <StageRunner exercises={stageExercises} onComplete={() => { setAttempt(0); complete(1); }} />}
    </div>
  );

  if (open === 2) return <div>{head}<StageRunner key={attempt} exercises={stageExercises} onComplete={() => complete(2)} /></div>;

  if (open === 3) {
    const ex = generate(keyOf(item.id, 'recall'), undefined, 0, { content, intensity: 'intensive', slots: kv.slots })!;
    const done = (o: Outcome) => {
      if (o.grade === 'again') { setAttempt(attempt + 1); return; }
      review(keyOf(item.id, 'recall'), o.grade, o.verdict);
      // The other dimensions enter long-term review now; each is then tested and scheduled separately.
      for (const d of DEEP_DIMENSIONS) if (d !== 'recall' && !getState().cards[keyOf(item.id, d)]) review(keyOf(item.id, d), 'good', 'stage');
      complete(3);
    };
    return (
      <div>{head}
        {attempt > 0 && <Muted className="mb-3">Not yet. Try again, or go back and study the text first.</Muted>}
        <ExerciseView key={attempt} ex={ex} onDone={done} allowEasy={false} />
      </div>
    );
  }

  return (
    <div>{head}
      <h1 lang="mi" className="reo mb-4 text-2xl font-bold">{item.title}</h1>
      <Card><Text r={r} /></Card>
      <div className="mt-3"><StatusBadge status={item.status} source={item.source} /></div>
      {needsDetails && <Muted className="mt-3">Add your own details in stage 1 to unlock the recall stages.</Muted>}
      <H2>Stages</H2>
      <List>
        {DEEP_STAGES.slice(0, 4).map((s, i) => (
          <Row key={s} title={`${i + 1}. ${s}`} sub={['Read it, with its background and use', 'Vocabulary, structure and significance', 'Missing words and ordering', 'Type it all from memory'][i]}
            right={<span className="text-sm text-muted">{stage > i ? '✓ Done' : stage === i ? 'Next' : ''}</span>}
            onClick={needsDetails && i > 1 ? undefined : () => { setAttempt(0); setOpen(i); window.scrollTo(0, 0); }} />
        ))}
      </List>
      <Muted className="mt-2">The order is recommended. You can open any stage.</Muted>
      <H2>5. Long-term mastery</H2>
      <Card>
        {stage < 4 ? <Muted>Complete full recall to begin long-term review. Each dimension is then scheduled and tracked separately.</Muted> : (
          <>
            {DEEP_DIMENSIONS.map((d) => <p key={d} className="flex justify-between py-1"><span>{DIMENSION_LABEL[d]}</span><span className="text-sm capitalize text-muted">{mastery.dimensions[d]}</span></p>)}
            <p className="mt-2 flex justify-between border-t border-line pt-2 font-semibold"><span>Overall</span><span className="capitalize">{mastery.overall}</span></p>
            <Muted className="mt-2">Overall is your weakest dimension. Knowing the words by heart is not the same as understanding them, and neither replaces learning from people who hold this knowledge.</Muted>
            <Button full variant="secondary" className="mt-3" onClick={() => startPractice([item.id], `/deep/${enc(item.id)}`)}>Practise all four now</Button>
          </>
        )}
      </Card>
    </div>
  );
}
