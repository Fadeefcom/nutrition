import type { ReactNode } from 'react';
import { motion } from 'framer-motion';

export function ChartFrame({
  title,
  actions,
  children,
  contentClassName = 'h-64 min-h-64',
}: {
  title: string;
  actions?: ReactNode;
  children: ReactNode;
  contentClassName?: string;
}) {
  return (
    <motion.section
      className="panel p-4"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
          {title}
        </h2>
        {actions}
      </div>
      <div className={contentClassName}>{children}</div>
    </motion.section>
  );
}
