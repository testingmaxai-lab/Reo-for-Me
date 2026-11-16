import { useSyncExternalStore } from 'react';
import type { Step } from '../engine/session';

const subscribe = (l: () => void) => { window.addEventListener('hashchange', l); return () => window.removeEventListener('hashchange', l); };
const read = () => window.location.hash.replace(/^#\/?/, '');
/** Hash routing: works on any static host with no server configuration. */
export function useRoute(): string[] {
  return useSyncExternalStore(subscribe, read).split('/').filter(Boolean).map(decodeURIComponent);
}
export function go(path: string): void { window.location.hash = path.replace(/^#/, ''); window.scrollTo(0, 0); }

export interface SessionSpec { title: string; steps: Step[]; mode: 'learn' | 'review' | 'practice'; back?: string }
let pending: SessionSpec | null = null;
let sessionId = 0;
const sessionListeners = new Set<() => void>();
export function startSession(spec: SessionSpec): void { pending = spec; sessionId++; sessionListeners.forEach((l) => l()); go('/session'); }
export const takeSession = () => pending;
/** Changes whenever a new session starts, so the session screen resets even if the route is unchanged. */
export const useSessionId = () => useSyncExternalStore((l) => { sessionListeners.add(l); return () => sessionListeners.delete(l); }, () => sessionId);
