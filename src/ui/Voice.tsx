import { useEffect, useRef, useState } from 'react';
import { dayLabel } from '../engine/dates';
import { addTake, deleteTake, KEEP_DAYS, listTakes, type Take } from '../store/audio';
import { Button, Muted } from './components';

const MAX_SECONDS = 30;
const pickMime = () => ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'].find((m) => MediaRecorder.isTypeSupported?.(m));

/**
 * Hear what you sound like: record yourself, play it back, and compare an earlier take with a
 * later one. This is the learner's own voice, not a model pronunciation.
 */
export function Voice({ itemId, text }: { itemId: string; text: string }) {
  const [takes, setTakes] = useState<Take[]>([]);
  const [recording, setRecording] = useState(false);
  const [playing, setPlaying] = useState<number | null>(null);
  const [error, setError] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const player = useRef<HTMLAudioElement | null>(null);
  const url = useRef('');
  const alive = useRef(true);
  const supported = typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const refresh = () => listTakes(itemId).then((t) => { if (alive.current) setTakes(t); }).catch(() => undefined);
  const stopPlayback = () => { player.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); url.current = ''; setPlaying(null); };
  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => { alive.current = false; clearTimeout(timer.current); if (recorder.current?.state === 'recording') recorder.current.stop(); player.current?.pause(); if (url.current) URL.revokeObjectURL(url.current); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId]);

  const start = async () => {
    setError('');
    stopPlayback();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mime = pickMime();
      const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      mr.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        clearTimeout(timer.current);
        if (alive.current) setRecording(false);
        const blob = new Blob(chunks, { type: mr.mimeType || mime || 'audio/mp4' });
        if (!blob.size) return;
        try { await addTake(itemId, await blob.arrayBuffer(), blob.type); await refresh(); } catch { if (alive.current) setError('Could not save the recording on this device.'); }
      };
      recorder.current = mr;
      mr.start();
      setRecording(true);
      timer.current = setTimeout(() => { if (mr.state === 'recording') mr.stop(); }, MAX_SECONDS * 1000);
    } catch {
      setError('The microphone is not available. Allow microphone access for this site in your browser or iPhone settings, then try again.');
    }
  };
  const stop = () => { if (recorder.current?.state === 'recording') recorder.current.stop(); };

  /** Plays takes one after another on a single audio element, which iOS allows after one tap. */
  const play = (list: Take[]) => {
    stopPlayback();
    const [first, ...rest] = list;
    if (!first) return;
    const a = (player.current ??= new Audio());
    url.current = URL.createObjectURL(new Blob([first.data], { type: first.mime }));
    a.src = url.current;
    a.onended = () => { if (rest.length) play(rest); else stopPlayback(); };
    a.onerror = () => { stopPlayback(); setError('This recording could not be played.'); };
    setPlaying(first.id);
    void a.play().catch(() => { stopPlayback(); setError('Playback was blocked. Tap play again.'); });
  };
  const remove = async (id: number) => { stopPlayback(); await deleteTake(id); await refresh(); };

  const now = Date.now();
  return (
    <section aria-label="Hear yourself" className="rounded-2xl border border-line bg-surface p-4">
      <p className="font-semibold">Hear yourself</p>
      <Muted className="mt-1">Say <span lang="mi" className="reo font-semibold text-ink">{text}</span> aloud, then listen back. Record again another day and compare.</Muted>
      {!supported ? <Muted className="mt-3">Recording is not supported in this browser.</Muted> : (
        <Button full variant={recording ? 'danger' : 'secondary'} className="mt-3" onClick={recording ? stop : () => void start()}>
          <span aria-hidden className={`mr-2 inline-block h-3 w-3 rounded-full align-middle ${recording ? 'animate-pulse bg-bad' : 'bg-bad'}`} />{recording ? 'Stop recording' : 'Record'}
        </Button>
      )}
      {error && <p role="alert" className="mt-2 text-sm text-bad">{error}</p>}
      {takes.length > 0 && (
        <ul className="mt-3 divide-y divide-line" aria-label="Your recordings">
          {takes.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-1.5">
              <button type="button" onClick={() => (playing === t.id ? stopPlayback() : play([t]))} aria-label={`${playing === t.id ? 'Stop' : 'Play'} recording from ${dayLabel(t.t, now)}`}
                className="flex h-11 w-11 items-center justify-center rounded-full bg-accent-soft text-accent">{playing === t.id ? '■' : '▶'}</button>
              <span className="flex-1 text-sm">{dayLabel(t.t, now)}</span>
              <button type="button" onClick={() => void remove(t.id)} aria-label={`Delete recording from ${dayLabel(t.t, now)}`} className="h-11 w-11 text-xl text-muted">×</button>
            </li>
          ))}
        </ul>
      )}
      {takes.length > 1 && <Button full variant="secondary" className="mt-2" onClick={() => play([takes[0], takes[takes.length - 1]])}>Compare: earliest, then latest</Button>}
      <Muted className="mt-3">This is your own voice, not a model pronunciation. Recordings stay on this device, are not included in backups, and are deleted after {KEEP_DAYS} days.</Muted>
    </section>
  );
}
