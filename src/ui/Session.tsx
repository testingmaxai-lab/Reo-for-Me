import { useMemo, useState } from 'react';
import { content, examplesFor, firstEn } from '../content';
import { generate, keyOf, parseKey } from '../engine/exercises';
import { unmetPrereqs } from '../engine/recommend';
import { dueCards, requeue, type Step } from '../engine/session';
import { getState, review, useAppState } from '../store/state';
import { Button, Card, Muted, Reo, StatusBadge } from './components';
import { ExerciseView, type Outcome } from './ExerciseView';
import { startLearn, startReview } from './actions';
import { go, takeSession } from './router';

export function Intro({ itemId, onNext, onKnown }: { itemId: string; onNext: () => void; onKnown?: () => void }) {
  const { cards } = useAppState();
  const v = content.vocabById.get(itemId);
  const p = content.patternById.get(itemId);
  if (v) {
    const ex = examplesFor(v);
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-muted">New word</p>
        <p lang="mi" className="reo text-4xl font-bold">{v.mi}</p>
        {v.altMi.length > 0 && <p className="mt-1 text-muted">also: <Reo>{v.altMi.join(', ')}</Reo></p>}
        <p className="mt-3 text-xl">{v.en.join('; ')}</p>
        {v.note && <Muted className="mt-3">{v.note}</Muted>}
        {ex.length > 0 && <div className="mt-4 space-y-2 rounded-xl bg-accent-soft p-4">{ex.map((e) => <p key={e.mi}><Reo className="font-semibold">{e.mi}</Reo><br /><span className="text-sm text-muted">{e.en}</span></p>)}</div>}
        <div className="mt-4"><StatusBadge status={v.status} source={v.source} /></div>
        <div className="mt-6 flex gap-2">
          {onKnown && <Button variant="secondary" onClick={onKnown}>I know this</Button>}
          <Button className="flex-1" autoFocus onClick={onNext}>Test me</Button>
        </div>
      </div>
    );
  }
  if (p) {
    const pre = unmetPrereqs(p.id, content, cards);
    return (
      <div>
        <p className="mb-2 text-sm font-medium text-muted">New sentence pattern</p>
        <h2 lang="mi" className="reo text-2xl font-bold">{p.title}</h2>
        <p lang="mi" className="reo mt-3 rounded-xl bg-accent-soft p-3 font-medium">{p.structure}</p>
        <p className="mt-3 leading-relaxed"><Reo>{p.explanation}</Reo></p>
        <div className="mt-4 space-y-2">{p.sentences.slice(0, 2).map((s) => <p key={s.id}><Reo className="text-lg font-semibold">{s.mi}</Reo><br /><span className="text-sm text-muted">{firstEn(s.en)}</span></p>)}</div>
        {pre.length > 0 && <Muted className="mt-4">Usually learned after: {pre.map((id) => content.patternById.get(id)!.title).join('; ')}. You can carry on regardless.</Muted>}
        <div className="mt-4"><StatusBadge status={p.status} source={p.source} /></div>
        <div className="mt-6 flex gap-2">
          {onKnown && <Button variant="secondary" onClick={onKnown}>I know this</Button>}
          <Button className="flex-1" autoFocus onClick={onNext}>Test me</Button>
        </div>
      </div>
    );
  }
  return <Button onClick={onNext}>Continue</Button>;
}

interface Tally { right: number; near: number; missed: Set<string> }

export function Session() {
  const spec = useMemo(takeSession, []);
  const [steps, setSteps] = useState<Step[]>(spec?.steps ?? []);
  const [index, setIndex] = useState(0);
  const [tally, setTally] = useState<Tally>({ right: 0, near: 0, missed: new Set() });
  const { cards } = useAppState();

  const step = steps[index];
  // Generated once per step from a snapshot, so it does not change underneath the learner.
  const current = useMemo(() => {
    if (!step || step.t !== 'ex') return null;
    const card = getState().cards[step.key];
    const variant = step.variant ?? card?.n ?? 0;
    return { variant, isNew: !card, ex: generate(step.key, card, variant, { content, intensity: getState().kv.settings.intensity, slots: getState().kv.slots }) };
  }, [step]);

  if (!spec) return <div className="p-6"><Muted>No session in progress.</Muted><Button className="mt-4" onClick={() => go('/')}>Home</Button></div>;

  const next = () => setIndex((i) => i + 1);
  const done = (o: Outcome) => {
    if (step?.t !== 'ex' || !current) return;
    // Someone who gets an untaught item right first time already knows it: skip ahead.
    const grade = step.fresh && current.isNew && o.grade === 'good' ? 'easy' : o.grade;
    review(step.key, grade, o.verdict);
    setTally((t) => {
      const missed = new Set(t.missed);
      if (grade === 'again') missed.add(parseKey(step.key).itemId);
      return { right: t.right + (grade === 'good' || grade === 'easy' ? 1 : 0), near: t.near + (grade === 'hard' ? 1 : 0), missed };
    });
    if (grade === 'again') setSteps((s) => requeue(s.map((x, i) => (i === index && x.t === 'ex' ? { ...x, variant: current.variant } : x)), index));
    next();
  };
  const known = (itemId: string) => {
    const skills = itemId.startsWith('p:') ? (['understand', 'apply'] as const) : (['recognise', 'produce'] as const);
    for (const s of skills) review(keyOf(itemId, s), 'easy', 'skipped');
    setSteps((s) => s.filter((x, i) => i <= index || x.t !== 'ex' || parseKey(x.key).itemId !== itemId));
    next();
  };

  if (step && step.t === 'ex' && current && !current.ex) { queueMicrotask(next); return null; }

  const finished = index >= steps.length;
  const due = dueCards(cards, content, Date.now()).length;
  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col px-4 pb-8" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <header className="mb-6 flex items-center gap-3">
        <button type="button" aria-label="End session" onClick={() => go(spec.back ?? '/')} className="h-11 w-11 rounded-full text-2xl text-muted">×</button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line" role="progressbar" aria-valuemin={0} aria-valuemax={steps.length} aria-valuenow={Math.min(index, steps.length)}>
          <div className="h-full bg-accent transition-all" style={{ width: `${steps.length ? (Math.min(index, steps.length) / steps.length) * 100 : 100}%` }} />
        </div>
        <span className="w-12 text-right text-sm tabular-nums text-muted">{Math.min(index + 1, steps.length)}/{steps.length}</span>
      </header>

      {finished ? (
        <div>
          <h1 className="text-2xl font-bold">Ka pai — session complete</h1>
          <Card className="mt-4">
            <p>{tally.right} correct{tally.near ? ` · ${tally.near} near miss${tally.near > 1 ? 'es' : ''}` : ''}{tally.missed.size ? ` · ${tally.missed.size} to revisit` : ''}</p>
            {tally.missed.size > 0 && <Muted className="mt-2">Coming back sooner: <Reo>{[...tally.missed].map((id) => content.vocabById.get(id)?.mi ?? content.patternById.get(id)?.title ?? content.deepById.get(id)?.title).join(', ')}</Reo></Muted>}
            {steps.length === 0 && <Muted>There was nothing to do in this session.</Muted>}
          </Card>
          <div className="mt-6 space-y-2">
            <Button full onClick={() => startLearn()}>Learn more new material</Button>
            {due > 0 && <Button full variant="secondary" onClick={() => startReview()}>Review {due} due</Button>}
            <Button full variant="ghost" onClick={() => go(spec.back ?? '/')}>Done</Button>
          </div>
        </div>
      ) : step.t === 'intro' ? (
        <Intro key={index} itemId={step.itemId} onNext={next} onKnown={() => known(step.itemId)} />
      ) : current?.ex ? (
        <>
          {step.retry && <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-warn">Again</p>}
          <ExerciseView key={index} ex={current.ex} onDone={done} />
        </>
      ) : null}
    </div>
  );
}
