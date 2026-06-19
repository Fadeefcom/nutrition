import { motion } from 'framer-motion';

interface ProgressRingProps {
  value: number;
  label: string;
  sublabel?: string;
  tone?: 'mint' | 'ember' | 'lagoon' | 'honey';
}

const toneClass = {
  mint: 'text-mint',
  ember: 'text-ember',
  lagoon: 'text-lagoon',
  honey: 'text-honey',
};

export function ProgressRing({ value, label, sublabel, tone = 'mint' }: ProgressRingProps) {
  const capped = Math.max(0, Math.min(100, value));
  const radius = 42;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (capped / 100) * circumference;

  return (
    <div className="flex items-center gap-3">
      <div className="relative h-24 w-24 shrink-0">
        <svg viewBox="0 0 100 100" className="h-full w-full -rotate-90">
          <circle
            cx="50"
            cy="50"
            r={radius}
            stroke="currentColor"
            strokeWidth="10"
            fill="none"
            className="text-black/10 dark:text-white/10"
          />
          <motion.circle
            cx="50"
            cy="50"
            r={radius}
            stroke="currentColor"
            strokeWidth="10"
            fill="none"
            strokeLinecap="round"
            className={toneClass[tone]}
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: offset }}
            transition={{ duration: 0.65, ease: 'easeOut' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center text-lg font-black text-zinc-900 dark:text-white">
          {Math.round(value)}%
        </div>
      </div>
      <div>
        <p className="text-sm font-bold text-zinc-950 dark:text-white">{label}</p>
        {sublabel ? <p className="mt-1 text-xs text-zinc-600 dark:text-zinc-300">{sublabel}</p> : null}
      </div>
    </div>
  );
}

