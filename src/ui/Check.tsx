import { useMemo, useState } from 'react';
import { content } from '../content';
import { auditSummary, KIND_LABEL, reviewUnits, type Unit } from '../engine/audit';
import { getState, setKV, useAppState } from '../store/state';
import { AnswerInput, Button, Card, H1, Muted, Reo, Segmented } from './components';

type Show = 'todo' | 'fix' | 'all';

function UnitCard({ unit, onDone, onBack, canBack }: { unit: Unit; onDone: () => void; onBack: () => void; canBack: boolean }) {
  const entry = useAppState().kv.audit[unit.id];
  const [note, setNote] = useState(entry?.note ?? '');
  const mark = (v: 'ok' | 'fix' | null) => {
    const audit = { ...getState().kv.audit };
    if (v) audit[unit.id] = { v, t: Date.now(), ...(note.trim() ? { note: note.trim() } : {}) }; else delete audit[unit.id];
    setKV('audit', audit);
    if (v) onDone();
  };
  return (
    <div>
      <p className="text-sm font-medium text-muted">{KIND_LABEL[unit.kind]} · <Reo>{unit.group}</Reo></p>
      <Card className="mt-2">
        <p lang="mi" className={`reo font-semibold leading-snug ${unit.mi.length > 40 ? 'text-xl' : 'text-3xl'}`}>{unit.mi}</p>
        <p className="mt-2 text-lg leading-relaxed"><Reo>{unit.en}</Reo></p>
        {unit.details.map((d) => <div key={d.label} className="mt-3"><div className="text-xs font-semibold uppercase tracking-wide text-muted">{d.label}</div><p className="leading-relaxed"><Reo>{d.text}</Reo></p></div>)}
      </Card>
      {entry && <p className={`mt-2 text-sm font-medium ${entry.v === 'ok' ? 'text-good' : 'text-warn'}`}>Currently marked: {entry.v === 'ok' ? 'correct' : 'needs fixing'} <button type="button" className="ml-2 underline" onClick={() => mark(null)}>Clear</button></p>}
      <div className="mt-3">
        <label className="mb-1 block text-sm font-medium">Note (optional): what should change?</label>
        <AnswerInput lang="mi" long autoFocus={false} label="Note" value={note} onChange={setNote} />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <Button variant="secondary" className="border-warn text-warn" onClick={() => mark('fix')}>Needs fixing</Button>
        <Button onClick={() => mark('ok')}>Correct</Button>
      </div>
      <div className="mt-2 grid grid-cols-2 gap-2">
        <Button variant="ghost" disabled={!canBack} onClick={onBack}>‹ Back</Button>
        <Button variant="ghost" onClick={onDone}>Skip ›</Button>
      </div>
    </div>
  );
}

/** A fluent speaker works through every item and marks it correct or needing a fix. */
export function Check() {
  const { kv } = useAppState();
  const units = useMemo(() => reviewUnits(content), []);
  const sum = auditSummary(units, kv.audit);
  const [group, setGroup] = useState('');
  const [show, setShow] = useState<Show>('todo');
  const [i, setI] = useState(0);
  const [epoch, setEpoch] = useState(0);
  // The queue is fixed when the filters change, so marking an item does not shuffle what comes next.
  const queue = useMemo(() => {
    const audit = getState().kv.audit;
    return units.filter((u) => (!group || u.groupId === group) && (show === 'all' || (show === 'todo' ? !audit[u.id] : audit[u.id]?.v === 'fix')));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [units, group, show, epoch]);
  const reset = (f: () => void) => { f(); setI(0); };
  const groups = [...new Map(units.map((u) => [u.groupId, u.group])).entries()];
  const unit = queue[i];

  return (
    <div>
      <a href="#/progress" className="mb-3 inline-block text-sm font-semibold text-accent">‹ Progress</a>
      <H1>Content check</H1>
      <details open={sum.ok + sum.fix === 0}>
        <summary className="cursor-pointer text-sm font-semibold text-accent">How this works</summary>
        <Muted className="mt-1">For a fluent speaker. Each item is shown once: mark it correct or needing a fix, with a note if you like. Nothing here affects learning progress. When finished, use “Export feedback” on the Progress page and send the file back so the content can be corrected.</Muted>
      </details>
      <p data-testid="check-summary" className="mt-3 text-sm font-medium">{sum.ok + sum.fix} of {sum.total} checked · {sum.fix} need fixing · {sum.left} to go</p>
      <div className="mt-1 h-2 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent" style={{ width: `${((sum.ok + sum.fix) / sum.total) * 100}%` }} /></div>
      <div className="mt-4"><Segmented label="Show" value={show} onChange={(v) => reset(() => setShow(v))} options={[{ value: 'todo', label: 'To check' }, { value: 'fix', label: 'Needs fixing' }, { value: 'all', label: 'All' }]} /></div>
      <label className="mt-3 block text-sm text-muted">Section
        <select value={group} onChange={(e) => reset(() => setGroup(e.target.value))} className="mt-1 block w-full rounded-xl border border-line bg-surface px-3 py-2.5 text-ink">
          <option value="">Everything</option>
          {groups.map(([id, title]) => <option key={id} value={id}>{title}</option>)}
        </select>
      </label>
      <div className="mt-5">
        {unit ? (
          <>
            <p className="mb-2 text-xs tabular-nums text-muted">{i + 1} of {queue.length} in this list</p>
            <UnitCard key={unit.id} unit={unit} canBack={i > 0} onBack={() => setI(i - 1)} onDone={() => { setI(i + 1); window.scrollTo(0, 0); }} />
          </>
        ) : (
          <Card>
            <p className="font-semibold">{queue.length ? 'End of this list.' : 'Nothing in this list.'}</p>
            <Muted className="mt-1">Change the section or what is shown, or refresh the list to pick up anything skipped.</Muted>
            <Button variant="secondary" className="mt-3" onClick={() => reset(() => setEpoch(epoch + 1))}>Refresh list</Button>
          </Card>
        )}
      </div>
    </div>
  );
}
