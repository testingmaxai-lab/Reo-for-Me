import { useMemo, useState } from 'react';
import { content } from '../content';
import { generate } from '../engine/exercises';
import { buildDiagnostic, scoreDiagnostic, type DiagnosticResult } from '../engine/recommend';
import { review, setKV, updateSettings, useAppState } from '../store/state';
import { startLearn } from './actions';
import { Button, Card, Muted } from './components';
import { ExerciseView, type Outcome } from './ExerciseView';
import { go } from './router';

export function LevelPicker() {
  const { kv } = useAppState();
  return (
    <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Starting level">
      {[1, 2, 3].map((l) => (
        <button key={l} type="button" role="radio" aria-checked={kv.settings.startLevel === l} onClick={() => updateSettings({ startLevel: l })}
          className={`min-h-11 rounded-xl border text-sm font-semibold ${kv.settings.startLevel === l ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface'}`}>Level {l}</button>
      ))}
    </div>
  );
}

export function DiagnosticSummary({ r }: { r: DiagnosticResult }) {
  return <p>{[1, 2, 3].map((l) => (r.byLevel[l] ? `Level ${l}: ${r.byLevel[l].correct}/${r.byLevel[l].total}` : null)).filter(Boolean).join(' · ')}</p>;
}

export function Diagnostic() {
  const qs = useMemo(() => buildDiagnostic(content), []);
  const [i, setI] = useState(0);
  const [answers, setAnswers] = useState<{ level: number; correct: boolean }[]>([]);
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const q = qs[i];
  // typed answers throughout: no sentence-building help in a diagnostic
  const ex = useMemo(() => (q ? generate(q.step.key, undefined, q.step.variant ?? 0, { content, intensity: 'intensive', slots: {} }) : null), [q]);

  const done = (o: Outcome) => {
    const correct = o.grade !== 'again';
    // Items answered correctly are scheduled as known; missed ones are left to be taught normally.
    if (o.grade === 'good') review(q.step.key, 'easy', 'diagnostic');
    const next = [...answers, { level: q.level, correct }];
    setAnswers(next);
    if (i + 1 >= qs.length) {
      const r = scoreDiagnostic(next, Date.now());
      setKV('diagnostic', r);
      updateSettings({ onboarded: true, startLevel: r.recommendedLevel });
      setResult(r);
    }
    setI(i + 1);
  };

  return (
    <div className="mx-auto max-w-xl px-4 pb-8" style={{ paddingTop: 'max(12px, env(safe-area-inset-top))' }}>
      <header className="mb-6 flex items-center gap-3">
        <button type="button" aria-label="Leave" onClick={() => go('/')} className="h-11 w-11 rounded-full text-2xl text-muted">×</button>
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent" style={{ width: `${(Math.min(i, qs.length) / qs.length) * 100}%` }} /></div>
        <span className="w-12 text-right text-sm tabular-nums text-muted">{Math.min(i + 1, qs.length)}/{qs.length}</span>
      </header>
      {result ? (
        <div>
          <h1 className="text-2xl font-bold">Suggested start: Level {result.recommendedLevel}</h1>
          <Card className="mt-4">
            <DiagnosticSummary r={result} />
            <Muted className="mt-2">This is a rough guide from 15 questions, not a measure of your proficiency. Earlier levels stay available, and you will be offered them later as quick checks rather than lessons.</Muted>
          </Card>
          <p className="mb-2 mt-6 text-sm font-medium text-muted">Start at</p>
          <LevelPicker />
          <Button full className="mt-6" onClick={() => { if (!startLearn()) go('/'); }}>Start learning</Button>
          <Button full variant="ghost" onClick={() => go('/')}>Home</Button>
        </div>
      ) : ex ? (
        <ExerciseView key={i} ex={ex} onDone={done} allowEasy={false} />
      ) : null}
    </div>
  );
}
