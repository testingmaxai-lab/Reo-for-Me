import { content } from '../content';
import { DEEP_STAGES } from '../engine/deep';
import type { Intensity } from '../engine/exercises';
import { greeting, maoriDate, shortDay } from '../engine/dates';
import { activity, doneToday, summary, roughPercent } from '../engine/progress';
import { isIntroduced, nextNew, units, weakAreas } from '../engine/recommend';
import { dueCards, PACE } from '../engine/session';
import { DAY } from '../engine/srs';
import { updateSettings, useAppState } from '../store/state';
import { startLearn, startPractice, startReview, startToday } from './actions';
import { Bars, Button, Card, H1, H2, List, Muted, Reo, Row } from './components';
import { go } from './router';

const label = (id: string) => content.vocabById.get(id)?.mi ?? content.patternById.get(id)?.title ?? id;

function useNext() {
  const { cards, kv } = useAppState();
  return nextNew(content, cards, { count: PACE[kv.settings.intensity].newItems, startLevel: kv.settings.startLevel, queue: kv.queue });
}

function NextNewCard() {
  const next = useNext();
  if (!next.itemIds.length) return <Card><p className="font-semibold">You have started everything available.</p><Muted className="mt-1">Keep reviewing, or add more content (see the README).</Muted></Card>;
  return (
    <Card>
      <p className="text-sm font-medium text-muted">{next.testOut ? 'Quick check of earlier material' : 'New learning'}{next.unit ? ` · ${next.unit.title}` : ''}</p>
      <p lang="mi" className="reo mt-1 text-lg font-semibold">{next.itemIds.map(label).join(' · ')}</p>
      <Button full className="mt-3" onClick={() => startLearn()}>{next.testOut ? 'Test out' : `Learn ${next.itemIds.length} new`}</Button>
    </Card>
  );
}

export function Home() {
  const { cards, reviews, kv } = useAppState();
  const next = useNext();
  const now = Date.now();
  const due = dueCards(cards, content, now).length;
  const s = summary(content, cards, reviews, now);
  const done = doneToday(reviews, now);
  const started = Object.keys(cards).length > 0;
  const deepActive = content.deep.filter((d) => kv.deep[d.id]);
  const suggestDeep = !deepActive.length && s.recognise.total - s.recognise.new >= 15 ? content.deep[0] : null;
  const backupStale = started && now - kv.settings.lastBackup > 14 * DAY;
  const nothing = !due && !next.itemIds.length;
  const week = activity(reviews, now, 7);

  return (
    <div className="space-y-4">
      <header>
        <p lang="mi" className="reo text-sm font-medium text-muted">{maoriDate(now)}</p>
        <h1 lang="mi" className="reo text-3xl font-bold tracking-tight">{greeting(now)}</h1>
      </header>
      {!kv.settings.onboarded && !started && (
        <Card>
          <p className="font-semibold">Where should you start?</p>
          <Muted className="mt-1">A 15-question check suggests a starting level. It is a rough guide, not a measure of proficiency, and you can change it at any time.</Muted>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={() => go('/diagnostic')}>Take the check</Button>
            <Button variant="secondary" onClick={() => updateSettings({ onboarded: true })}>Skip</Button>
          </div>
        </Card>
      )}

      <section aria-label="Today" className="rounded-3xl bg-hero p-5 text-on-hero">
        <p className="text-sm font-semibold uppercase tracking-wide opacity-80">Today</p>
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          {[['Due', due, 'due-count'], [next.testOut ? 'To check' : 'New', next.itemIds.length, 'new-count'], ['Done today', done, 'done-count']].map(([l, n, id]) => (
            <div key={id} className="rounded-2xl bg-on-hero/10 py-3"><p data-testid={id as string} className="text-3xl font-bold tabular-nums">{n}</p><p className="text-xs opacity-80">{l}</p></div>
          ))}
        </div>
        {next.itemIds.length > 0 && <p className="mt-3 text-sm opacity-90">{next.testOut ? 'Quick check' : 'New'}{next.unit ? ` · ${next.unit.title}` : ''}: <span lang="mi" className="reo font-semibold">{next.itemIds.map(label).join(' · ')}</span></p>}
        {nothing
          ? <p className="mt-3 text-sm opacity-90">Nothing is due and you have started everything available. Explore, or practise a topic.</p>
          : <Button full variant="inverse" className="mt-4" onClick={() => startToday()}>Start today’s session</Button>}
        {due > 0 && next.itemIds.length > 0 && (
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Button variant="onAccent" className="!min-h-11 text-sm" onClick={() => startReview()}>Review only</Button>
            <Button variant="onAccent" className="!min-h-11 text-sm" onClick={() => startLearn()}>New only</Button>
          </div>
        )}
      </section>

      {(deepActive.length > 0 || suggestDeep) && (
        <div>
          <H2>Deep learning</H2>
          <List>
            {deepActive.map((d) => <Row key={d.id} lang="mi" title={d.title} sub={`Stage: ${DEEP_STAGES[Math.min(kv.deep[d.id].stage, 4)]}`} onClick={() => go(`/deep/${encodeURIComponent(d.id)}`)} />)}
            {suggestDeep && <Row lang="mi" title={suggestDeep.title} sub="Suggested: begin a whakataukī" onClick={() => go(`/deep/${encodeURIComponent(suggestDeep.id)}`)} />}
          </List>
        </div>
      )}
      {started && (
        <div>
          <H2>This week</H2>
          <Card>
            <Bars title="Answers per day" values={week} emphasise={6} labels={week.map((_, i) => shortDay(now - (6 - i) * DAY))} />
            <p className="mt-3 text-sm">{s.recognise.total - s.recognise.new} of {s.recognise.total} words started · {s.understand.total - s.understand.new} of {s.understand.total} patterns</p>
            {s.retention !== null && <Muted>Estimated retention {roughPercent(s.retention)}</Muted>}
          </Card>
        </div>
      )}
      {backupStale && (
        <Card>
          <p className="font-semibold">Back up your progress</p>
          <Muted className="mt-1">Progress is stored only on this device. Export a copy every so often.</Muted>
          <Button variant="secondary" className="mt-3" onClick={() => go('/progress')}>Go to backup</Button>
        </Card>
      )}
    </div>
  );
}

const PACE_LABEL: Record<Intensity, string> = { light: 'Light', standard: 'Standard', intensive: 'Intensive' };
const PACE_HELP: Record<Intensity, string> = {
  light: '3 new items, up to 10 reviews. Sentence-building help stays longer.',
  standard: '5 new items, up to 20 reviews.',
  intensive: '8 new items, up to 40 reviews. No sentence-building help: you type everything.',
};
export function PacePicker() {
  const { kv } = useAppState();
  return (
    <div>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Practice intensity">
        {(Object.keys(PACE_LABEL) as Intensity[]).map((p) => (
          <button key={p} type="button" role="radio" aria-checked={kv.settings.intensity === p} onClick={() => updateSettings({ intensity: p })}
            className={`min-h-11 rounded-xl border text-sm font-semibold ${kv.settings.intensity === p ? 'border-accent bg-accent-soft text-accent' : 'border-line bg-surface'}`}>{PACE_LABEL[p]}</button>
        ))}
      </div>
      <Muted className="mt-2">{PACE_HELP[kv.settings.intensity]} These set session size only; you can always do more.</Muted>
    </div>
  );
}

export function Learn() {
  const { cards, kv } = useAppState();
  const all = units(content);
  return (
    <div>
      <H1>Learn</H1>
      <NextNewCard />
      <H2>Pace</H2>
      <PacePicker />
      <H2>Pathway — start anywhere</H2>
      <Muted className="mb-2">The order is a recommendation. Nothing is locked. Your starting level is {kv.settings.startLevel}.</Muted>
      {[1, 2, 3].map((level) => (
        <div key={level} className="mb-4">
          <p className="mb-1 text-sm font-semibold">Level {level}</p>
          <List>
            {all.filter((u) => u.level === level).map((u) => {
              const done = u.itemIds.filter((id) => isIntroduced(id, cards)).length;
              const left = u.itemIds.length - done;
              return (
                <Row key={u.id} lang={u.kind === 'pattern' ? 'mi' : undefined} title={u.title}
                  sub={u.kind === 'pattern' ? (done ? 'Started' : 'Sentence pattern') : `${done} of ${u.itemIds.length} words started`}
                  right={left > 0
                    ? <span className="flex gap-1">
                        <Button variant="secondary" className="!min-h-10 !px-3 text-sm" onClick={() => startLearn({ within: u.itemIds, testOut: true, back: '/learn' })}>Test out</Button>
                        <Button className="!min-h-10 !px-3 text-sm" onClick={() => startLearn({ within: u.itemIds, back: '/learn' })}>Learn</Button>
                      </span>
                    : <Button variant="secondary" className="!min-h-10 !px-3 text-sm" onClick={() => startPractice(u.itemIds, '/learn')}>Practise</Button>} />
              );
            })}
          </List>
        </div>
      ))}
    </div>
  );
}

export function Review() {
  const { cards } = useAppState();
  const now = Date.now();
  const due = dueCards(cards, content, now);
  const upcoming = Object.values(cards).filter((c) => c.due > now).sort((a, b) => a.due - b.due);
  const weak = weakAreas(content, cards);
  const inDays = (n: number) => upcoming.filter((c) => c.due <= now + n * DAY).length;
  return (
    <div>
      <H1>Review</H1>
      <Card>
        {due.length > 0 ? (
          <>
            <p className="text-3xl font-bold tabular-nums">{due.length}</p>
            <Muted>due now, most overdue first</Muted>
            <Button full className="mt-3" onClick={() => startReview('/review')}>Start review</Button>
          </>
        ) : (
          <>
            <p className="font-semibold">Nothing is due.</p>
            <Muted className="mt-1">{upcoming.length ? `Next review: ${new Date(upcoming[0].due).toLocaleString('en-NZ', { weekday: 'short', hour: 'numeric', minute: '2-digit' })}.` : 'Learn something new and it will come back here for review.'}</Muted>
            <Button full variant="secondary" className="mt-3" onClick={() => go('/learn')}>Learn new material</Button>
          </>
        )}
      </Card>
      {upcoming.length > 0 && <><H2>Coming up</H2><Card><p>{inDays(1)} within a day · {inDays(7)} within a week · {upcoming.length} scheduled in total</p></Card></>}
      {weak.length > 0 && (
        <>
          <H2>Needs attention</H2>
          <List>{weak.map((w) => <Row key={w.itemId + w.skill} lang="mi" title={<Reo>{w.label}</Reo>} sub={`${w.skill} · missed ${w.lapses} time${w.lapses === 1 ? '' : 's'}`} />)}</List>
          <Button full variant="secondary" className="mt-3" onClick={() => startPractice([...new Set(weak.map((w) => w.itemId))], '/review')}>Practise these now</Button>
        </>
      )}
    </div>
  );
}
