import type { Status } from '../content/types';
import { effectiveStatus } from '../engine/audit';
import { useAppState } from '../store/state';
import { StatusBadge } from './components';

/** Status badge that reflects a content check made on this device. */
export function ItemStatus({ id, status, source }: { id: string; status: Status; source?: string }) {
  const entry = useAppState().kv.audit[id];
  const e = effectiveStatus(status, entry);
  return (
    <div>
      <StatusBadge status={e.status} source={source} />
      {e.local === 'ok' && <p className="mt-1 text-xs text-muted">Marked correct in the content check on this device.</p>}
      {e.local === 'fix' && <p className="mt-1 text-xs font-medium text-warn">Flagged as needing a fix{entry?.note ? `: ${entry.note}` : '.'}</p>}
    </div>
  );
}
