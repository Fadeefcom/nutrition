import type { ReactNode } from 'react';

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-black/15 p-5 text-sm text-zinc-600 dark:border-white/15 dark:text-zinc-300">
      <p className="font-semibold text-zinc-900 dark:text-white">{title}</p>
      {children ? <div className="mt-1">{children}</div> : null}
    </div>
  );
}

