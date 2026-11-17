import { useEffect, useState, type FormEvent } from 'react';
import { content } from '../content';
import type { Exercise } from '../engine/exercises';
import { checkAnswer, diffExpected, hintFor, normMi, type CheckResult, type Verdict } from '../engine/normalize';
import { primaryAnswer } from '../engine/exercises';
import { classifyError, type ErrorKind } from '../engine/insights';
import type { Grade } from '../engine/srs';
import { AnswerInput, Button, Reo } from './components';

export interface Outcome { grade: Grade; verdict: Verdict | 'self' | 'override' | 'skipped'; answer?: string; error?: ErrorKind }

const VERDICT: Record<Verdict, { label: string; tone: string; grade: Grade }> = {
  correct: { label: 'Correct', tone: 'bg-good-soft text-good', grade: 'good' },
  alternative: { label: 'Correct — an accepted alternative', tone: 'bg-good-soft text-good', grade: 'good' },
  macron: { label: 'Nearly — check the macrons', tone: 'bg-warn-soft text-warn', grade: 'hard' },
  typo: { label: 'Nearly — small spelling slip', tone: 'bg-warn-soft text-warn', grade: 'hard' },
  wrong: { label: 'Not quite', tone: 'bg-bad-soft text-bad', grade: 'again' },
};

/** If a wrong Māori answer is itself a word we know, say what it means. */
function knownWordNote(input: string, ex: Exercise): string | undefined {
  if (ex.answerLang !== 'mi') return;
  const n = normMi(input, content.equivalents);
  const v = content.vocab.find((x) => normMi(x.mi, content.equivalents) === n);
  return v ? `“${v.mi}” means ${v.en.slice(0, 2).join(' / ')}.` : undefined;
}

export function ExerciseView({ ex, onDone, allowEasy = true }: { ex: Exercise; onDone: (o: Outcome) => void; allowEasy?: boolean }) {
  const [value, setValue] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [hinted, setHinted] = useState(false);

  const answer = ex.mode === 'tiles' ? picked.map((i) => ex.tiles![i]).join(' ') : value;
  const check = (text: string) => setResult(checkAnswer(text, ex.answers, ex.answerLang, { equivalents: content.equivalents, lexicon: content.lexicon, looseEn: ex.looseEn }));
  // A correct answer after a hint counts as a near miss: it was not unaided recall.
  const finish = (o?: Outcome) => {
    let out: Outcome = o ?? { grade: VERDICT[result!.verdict].grade, verdict: result!.verdict };
    // keep what was typed for answers that were not right, so the Review tab can show patterns
    if (result && out.verdict !== 'override' && result.verdict !== 'correct' && result.verdict !== 'alternative')
      out = { ...out, answer: answer.trim(), error: classifyError(result.verdict, answer, !!result.note?.includes('word order'), !!knownWordNote(answer, ex)) };
    onDone(hinted && (out.grade === 'good' || out.grade === 'easy') ? { ...out, grade: 'hard' } : out);
  };
  const submit = (e: FormEvent) => { e.preventDefault(); if (result) finish(); else if (answer.trim()) check(answer); };

  // Enter continues after tile and self-check exercises too (no text field holds focus there).
  useEffect(() => {
    if (!result || ex.mode === 'type') return;
    const h = (e: KeyboardEvent) => { if (e.key === 'Enter') { e.preventDefault(); finish(); } };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  });

  const prompt = (
    <div className="mb-5">
      <p data-testid="instruction" className="mb-2 text-sm font-medium text-muted">{ex.instruction}</p>
      <p data-testid="prompt" lang={ex.promptLang} className={`reo font-semibold leading-snug ${ex.prompt.length > 60 ? 'text-xl' : 'text-3xl'}`}>{ex.prompt}</p>
      {ex.sub && <p className="mt-1 text-sm text-muted">{ex.sub}</p>}
    </div>
  );

  if (ex.mode === 'self') {
    return (
      <div data-testid="exercise" data-mode="self">
        {prompt}
        {!revealed ? <Button full autoFocus onClick={() => setRevealed(true)}>Show answer</Button> : (
          <>
            <div className="mb-4 space-y-3 rounded-xl bg-accent-soft p-4">
              {ex.reveal!.map((r) => <div key={r.label}><div className="text-xs font-semibold uppercase tracking-wide text-muted">{r.label}</div><p className="leading-relaxed">{r.text}</p></div>)}
            </div>
            <p className="mb-2 text-sm text-muted">How well did you know it?</p>
            <div className="grid grid-cols-3 gap-2">
              <Button variant="secondary" onClick={() => finish({ grade: 'again', verdict: 'self' })}>Didn’t know</Button>
              <Button variant="secondary" onClick={() => finish({ grade: 'hard', verdict: 'self' })}>Partly</Button>
              <Button onClick={() => finish({ grade: 'good', verdict: 'self' })}>Knew it</Button>
            </div>
          </>
        )}
      </div>
    );
  }

  const v = result && VERDICT[result.verdict];
  const right = result && (result.verdict === 'correct' || result.verdict === 'alternative');
  const used = new Set(picked);
  const canHint = ex.mode === 'type' && ex.answerLang === 'mi' && !ex.long && allowEasy;
  const diff = result && !right && answer.trim() && result.expected.trim().includes(' ') ? diffExpected(answer, result.expected, ex.answerLang, content.equivalents) : null;
  return (
    <form onSubmit={submit} data-testid="exercise" data-mode={ex.mode}>
      {prompt}
      {ex.mode === 'tiles' ? (
        <div>
          <div lang="mi" aria-label="Your sentence" className="mb-3 flex min-h-14 flex-wrap gap-2 rounded-xl border border-line bg-surface p-2">
            {picked.map((i, pos) => <button key={pos} type="button" disabled={!!result} onClick={() => setPicked(picked.filter((_, p) => p !== pos))} className="h-10 rounded-lg bg-accent-soft px-3 text-lg font-medium">{ex.tiles![i]}</button>)}
          </div>
          {!result && (
            <div lang="mi" className="flex flex-wrap gap-2" role="group" aria-label="Words to choose from">
              {ex.tiles!.map((t, i) => <button key={i} type="button" disabled={used.has(i)} onClick={() => setPicked([...picked, i])} className="h-11 rounded-lg border border-line bg-surface px-3 text-lg font-medium disabled:opacity-25">{t}</button>)}
            </div>
          )}
        </div>
      ) : (
        <AnswerInput value={value} onChange={setValue} lang={ex.answerLang} long={ex.long} readOnly={!!result} />
      )}
      {hinted && !result && <p data-testid="hint" className="rise mt-2 text-sm text-muted">Hint: <span lang="mi" className="reo font-semibold text-ink">{hintFor(primaryAnswer(ex))}</span></p>}

      {!result ? (
        <div className="mt-4 flex gap-2">
          <Button variant="secondary" onClick={() => check('')}>Don’t know</Button>
          {canHint && !hinted && <Button variant="secondary" onClick={() => setHinted(true)}>Hint</Button>}
          <Button type="submit" className="flex-1" disabled={!answer.trim()}>Check</Button>
        </div>
      ) : (
        <div className="rise mt-4" role="status" aria-live="polite">
          <div data-testid="feedback" data-verdict={result.verdict} className={`rounded-xl p-4 ${v!.tone}`}>
            <p className="font-bold">{v!.label}</p>
            {(!right || result.verdict === 'alternative') && <p className="mt-1 text-ink"><span className="text-sm text-muted">Expected: </span><span lang={ex.answerLang} className="reo text-lg font-semibold">{diff ? diff.map((d, i) => <span key={i} className={d.ok ? '' : 'underline decoration-2 underline-offset-4'}>{d.word}{' '}</span>) : result.expected}</span></p>}
            {diff && diff.some((d) => !d.ok) && diff.some((d) => d.ok) && <p className="mt-1 text-xs text-muted">Underlined words were missing or different in your answer.</p>}
            {hinted && right && <p className="mt-1 text-sm text-ink">Hint used, so this counts as a near miss.</p>}
            {result.alternatives.length > 0 && <p className="mt-1 text-sm text-ink"><span className="text-muted">Also accepted: </span><span lang={ex.answerLang}>{result.alternatives.slice(0, 5).join(' · ')}</span></p>}
            {result.note && <p className="mt-2 text-sm text-ink">{result.note}</p>}
            {result.verdict === 'wrong' && knownWordNote(answer, ex) && <p className="mt-2 text-sm text-ink">{knownWordNote(answer, ex)}</p>}
            {ex.explain && (!right || ex.concept?.route.includes('deep')) && <p className="mt-2 text-sm text-ink"><Reo>{ex.explain}</Reo></p>}
            {ex.concept && !right && <a href={ex.concept.route} className="mt-2 inline-block text-sm font-semibold underline">Open: {ex.concept.label}</a>}
          </div>
          <div className="mt-3 flex gap-2">
            {right && allowEasy && !hinted && <Button variant="secondary" onClick={() => finish({ grade: 'easy', verdict: result.verdict })}>Too easy</Button>}
            {!right && answer.trim() && <Button variant="secondary" onClick={() => finish({ grade: 'good', verdict: 'override' })}>I was right</Button>}
            <Button type="submit" className="flex-1" autoFocus={ex.mode === 'tiles'}>Continue</Button>
          </div>
        </div>
      )}
    </form>
  );
}
