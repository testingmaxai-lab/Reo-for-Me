import { useLayoutEffect } from 'react';
import { useAppState } from '../store/state';
import { Deep } from './Deep';
import { Diagnostic } from './Diagnostic';
import { Explore, ItemPage, TopicPage } from './Explore';
import { Home, Learn, Review } from './Home';
import { Progress } from './Progress';
import { Session } from './Session';
import { useRoute, useSessionId } from './router';

const TABS = [
  { path: '', label: 'Home', icon: 'M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z' },
  { path: 'learn', label: 'Learn', icon: 'M12 5v14M5 12h14' },
  { path: 'review', label: 'Review', icon: 'M4 12a8 8 0 1 0 3-6.2M4 4v5h5' },
  { path: 'explore', label: 'Explore', icon: 'M4 6h16M4 12h16M4 18h10' },
  { path: 'progress', label: 'Progress', icon: 'M5 20V10M12 20V4M19 20v-7' },
];

export function App() {
  const route = useRoute();
  const sessionId = useSessionId();
  const { ready, error, kv } = useAppState();
  const theme = kv.settings.theme;
  useLayoutEffect(() => {
    if (!ready) return;
    if (theme === 'auto') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = theme;
    // remembered outside the database so the right colours are used from the very first paint
    try { localStorage.setItem('reo-theme', theme); } catch { /* storage unavailable: harmless */ }
  }, [theme, ready]);
  const [top, a, b] = route;
  if (!ready) return <div className="grid h-full place-items-center text-muted">Loading…</div>;
  if (top === 'session') return <Session key={sessionId} />;
  if (top === 'diagnostic') return <Diagnostic />;

  const page =
    top === 'learn' ? <Learn /> :
    top === 'review' ? <Review /> :
    top === 'explore' ? (a === 'topic' && b ? <TopicPage id={b} /> : a === 'item' && b ? <ItemPage id={b} /> : <Explore />) :
    top === 'deep' && a ? <Deep key={a} id={a} /> :
    top === 'progress' ? <Progress /> :
    <Home />;
  const active = top === 'deep' ? 'explore' : top ?? '';

  return (
    <div className="mx-auto flex min-h-full max-w-xl flex-col">
      <main className="flex-1 px-4 pb-28" style={{ paddingTop: 'max(20px, env(safe-area-inset-top))' }}>
        {error && <p role="alert" className="mb-4 rounded-xl bg-bad-soft p-3 text-sm text-bad">{error}</p>}
        {page}
      </main>
      <nav aria-label="Main" className="fixed inset-x-0 bottom-0 border-t border-line bg-surface" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="mx-auto flex max-w-xl">
          {TABS.map((t) => (
            <a key={t.path} href={`#/${t.path}`} aria-current={active === t.path ? 'page' : undefined}
              className={`flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-xs font-medium ${active === t.path ? 'text-accent' : 'text-muted'}`}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d={t.icon} /></svg>
              {t.label}
            </a>
          ))}
        </div>
      </nav>
    </div>
  );
}
