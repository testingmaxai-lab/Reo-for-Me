import { useRef, useState } from 'react';
import { content } from '../content';
import { STATUS_HELP, STATUS_LABEL, type Status } from '../content/types';
import { deepMastery } from '../engine/deep';
import { roughPercent, summary } from '../engine/progress';
import { weakAreas } from '../engine/recommend';
import { parseBackup } from '../store/backup';
import { exportJson, importJson, resetAll, updateSettings, useAppState } from '../store/state';
import { BucketBar, Button, Card, H1, H2, List, Muted, Reo, Row } from './components';
import { DiagnosticSummary, LevelPicker } from './Diagnostic';
import { PacePicker } from './Home';
import { go } from './router';

async function doExport(): Promise<void> {
  const name = `reo-progress-${new Date().toLocaleDateString('en-CA')}.json`;
  const file = new File([exportJson()], name, { type: 'application/json' });
  const touch = window.matchMedia('(pointer: coarse)').matches;
  if (touch && navigator.canShare?.({ files: [file] })) {
    // On iPhone the share sheet offers "Save to Files", which is the reliable way to keep a copy.
    try { await navigator.share({ files: [file], title: name }); } catch (e) { if ((e as Error).name === 'AbortError') return; }
  } else {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  updateSettings({ lastBackup: Date.now() });
}

export function Progress() {
  const { cards, reviews, kv } = useAppState();
  const now = Date.now();
  const s = summary(content, cards, reviews, now);
  const weak = weakAreas(content, cards);
  const fileRef = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const counts = (['verified', 'cross-checked', 'draft', 'example'] as Status[]).map((st) => ({ st, n: [...content.vocab, ...content.patterns, ...content.deep].filter((x) => x.status === st).length })).filter((x) => x.n);

  const onFile = async (f: File | undefined) => {
    if (!f) return;
    const text = await f.text();
    if (fileRef.current) fileRef.current.value = '';
    // validate before asking, so a bad file can never lead to data being replaced
    const check = parseBackup(text);
    if (!check.ok) { setMsg({ ok: false, text: check.error }); return; }
    if (Object.keys(cards).length && !window.confirm(`Importing replaces all progress on this device with the backup (${check.backup.cards.length} learning records). Continue?`)) return;
    const res = await importJson(text);
    setMsg(res.ok ? { ok: true, text: `Restored ${res.cards} learning records.` } : { ok: false, text: res.error });
  };

  return (
    <div>
      <H1>Progress</H1>
      <Card>
        <BucketBar label="Words you recognise" b={s.recognise} />
        <BucketBar label="Words you can produce" b={s.produce} />
        <BucketBar label="Patterns you understand" b={s.understand} />
        <BucketBar label="Patterns you can use" b={s.apply} />
        <Muted className="mt-2">Strong = recalled after three weeks or more. Familiar = after one to three weeks.</Muted>
      </Card>

      <H2>Review</H2>
      <Card>
        <p>{s.due} due now · {s.reviewsThisWeek} answers on {s.daysActiveThisWeek} day{s.daysActiveThisWeek === 1 ? '' : 's'} this week</p>
        <Muted className="mt-1">
          {s.accuracyThisWeek !== null ? `Answered correctly this week: ${roughPercent(s.accuracyThisWeek)}. ` : ''}
          {s.retention !== null ? `Estimated retention of learned material: ${roughPercent(s.retention)}. This is a model-based estimate, not a measurement.` : 'A retention estimate appears once at least ten items are in long-term review.'}
        </Muted>
      </Card>

      <H2>Deep learning</H2>
      <List>
        {content.deep.map((d) => {
          const m = deepMastery(d.id, cards);
          const st = kv.deep[d.id];
          return <Row key={d.id} lang="mi" title={d.title} sub={<span className="capitalize">{!st ? 'Not started' : st.stage < 4 ? `Stage ${st.stage + 1} of 5` : `Overall: ${m.overall} · recall ${m.dimensions.recall}, meaning ${m.dimensions.meaning}`}</span>} onClick={() => go(`/deep/${encodeURIComponent(d.id)}`)} />;
        })}
      </List>

      {weak.length > 0 && <><H2>Needs attention</H2><List>{weak.map((w) => <Row key={w.itemId + w.skill} title={<Reo>{w.label}</Reo>} sub={`${w.skill} · missed ${w.lapses} times`} onClick={() => go(`/explore/item/${encodeURIComponent(w.itemId)}`)} />)}</List></>}

      <H2>Pace</H2>
      <PacePicker />

      <H2>Starting level</H2>
      <LevelPicker />
      <Card className="mt-2">
        {kv.diagnostic ? <><DiagnosticSummary r={kv.diagnostic} /><Muted className="mt-1">Check taken {new Date(kv.diagnostic.takenAt).toLocaleDateString('en-NZ')}. Suggested level {kv.diagnostic.recommendedLevel}. A rough guide only.</Muted></> : <Muted>You have not taken the starting check.</Muted>}
        <Button variant="secondary" className="mt-3" onClick={() => go('/diagnostic')}>{kv.diagnostic ? 'Retake the check' : 'Take the check'}</Button>
      </Card>

      <H2>Backup</H2>
      <Card>
        <Muted>Your progress is stored only in this browser on this device. There is no account and nothing is uploaded. It does not sync between your phone and computer. It can be lost if you clear website data, delete the app from your home screen, or, in Safari without installing, do not open the site for some weeks. Export a backup regularly and keep the file somewhere safe (Files, iCloud Drive).</Muted>
        <p className="mt-3 text-sm">{kv.settings.lastBackup ? `Last export: ${new Date(kv.settings.lastBackup).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })}` : 'No export yet.'}</p>
        <div className="mt-3 flex gap-2">
          <Button className="flex-1" onClick={() => void doExport()}>Export progress</Button>
          <Button variant="secondary" className="flex-1" onClick={() => fileRef.current?.click()}>Import</Button>
        </div>
        <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" aria-label="Backup file to import" onChange={(e) => void onFile(e.target.files?.[0])} />
        {msg && <p role="status" className={`mt-3 rounded-lg p-3 text-sm ${msg.ok ? 'bg-good-soft text-good' : 'bg-bad-soft text-bad'}`}>{msg.text}</p>}
      </Card>

      <H2>About the content</H2>
      <Card className="space-y-2">
        {counts.map(({ st, n }) => <p key={st} className="text-sm"><span className="font-semibold">{n} {STATUS_LABEL[st]}</span><br /><span className="text-muted">{STATUS_HELP[st]}</span></p>)}
        <Muted>Answers are checked against curated answer lists, not by AI. If you are marked wrong for a correct answer, use “I was right”, and consider adding your wording to the content files.</Muted>
      </Card>

      <H2>Reset</H2>
      {confirmReset
        ? <Card><p className="font-semibold">Delete all progress on this device?</p><Muted className="mt-1">This cannot be undone. Export first if you might want it back.</Muted><div className="mt-3 flex gap-2"><Button variant="danger" className="flex-1" onClick={() => void resetAll().then(() => { setConfirmReset(false); setMsg(null); })}>Delete everything</Button><Button variant="secondary" className="flex-1" onClick={() => setConfirmReset(false)}>Cancel</Button></div></Card>
        : <Button variant="danger" onClick={() => setConfirmReset(true)}>Reset all progress</Button>}
    </div>
  );
}
