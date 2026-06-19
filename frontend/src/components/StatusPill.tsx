import type { StatusState } from '../types/models';
import { statusClasses, statusDot } from '../utils/calculations';

export function StatusPill({ state, label }: { state: StatusState; label: string }) {
  return (
    <span className={`inline-flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ${statusClasses(state)}`}>
      <span className={`h-2 w-2 rounded-full ${statusDot(state)}`} />
      {label}
    </span>
  );
}

