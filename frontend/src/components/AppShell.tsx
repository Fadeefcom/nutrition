import type { ReactNode } from 'react';
import {
  Activity,
  Apple,
  Dumbbell,
  LineChart,
  Moon,
  PackageSearch,
  Settings,
  Sun,
} from 'lucide-react';
import type { PageId } from '../types/models';
import { cx } from '../utils/cx';

const items: Array<{ id: PageId; label: string; icon: typeof Activity }> = [
  { id: 'dashboard', label: 'Dashboard', icon: Activity },
  { id: 'workouts', label: 'Workouts', icon: Dumbbell },
  { id: 'nutrition', label: 'Nutrition', icon: Apple },
  { id: 'products', label: 'Products', icon: PackageSearch },
  { id: 'progress', label: 'Progress', icon: LineChart },
  { id: 'settings', label: 'Settings', icon: Settings },
];

export function AppShell({
  page,
  darkMode,
  onToggleTheme,
  onNavigate,
  children,
}: {
  page: PageId;
  darkMode: boolean;
  onToggleTheme: () => void;
  onNavigate: (page: PageId) => void;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen text-zinc-900 dark:text-white">
      <aside className="fixed left-0 top-0 hidden h-screen w-64 border-r border-black/10 bg-white/70 p-4 backdrop-blur-xl dark:border-white/10 dark:bg-black/20 lg:block">
        <div className="mb-8 flex items-center gap-3">
          <div className="grid h-11 w-11 place-items-center rounded-lg bg-ink text-white dark:bg-mint dark:text-ink">
            <Activity size={22} />
          </div>
          <div>
            <p className="text-lg font-black">Fitness Diary</p>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">Daily training log</p>
          </div>
        </div>
        <nav className="space-y-2">
          {items.map((item) => (
            <NavButton
              key={item.id}
              item={item}
              active={page === item.id}
              onClick={() => onNavigate(item.id)}
              wide
            />
          ))}
        </nav>
        <button className="btn btn-ghost mt-6 w-full" onClick={onToggleTheme} title="Toggle dark mode">
          {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          {darkMode ? 'Light' : 'Dark'}
        </button>
      </aside>

      <header className="sticky top-0 z-30 border-b border-black/10 bg-white/75 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-black/25 lg:hidden">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">Fitness Diary</p>
            <h1 className="text-xl font-black">{items.find((item) => item.id === page)?.label}</h1>
          </div>
          <button className="btn btn-ghost h-10 w-10 px-0" onClick={onToggleTheme} title="Toggle dark mode">
            {darkMode ? <Sun size={18} /> : <Moon size={18} />}
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-5 lg:ml-64 lg:px-8 lg:pb-10" style={{ paddingBottom: 'max(7rem, calc(7rem + env(safe-area-inset-bottom)))' }}>
        {children}
      </main>

      <nav className="pb-safe-nav fixed bottom-0 left-0 right-0 z-40 grid grid-cols-6 border-t border-black/10 bg-white/85 px-2 pt-2 backdrop-blur-xl dark:border-white/10 dark:bg-black/35 lg:hidden">
        {items.map((item) => (
          <NavButton
            key={item.id}
            item={item}
            active={page === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </nav>
    </div>
  );
}

function NavButton({
  item,
  active,
  onClick,
  wide = false,
}: {
  item: { id: PageId; label: string; icon: typeof Activity };
  active: boolean;
  onClick: () => void;
  wide?: boolean;
}) {
  const Icon = item.icon;
  return (
    <button
      className={cx(
        'rounded-lg transition',
        wide
          ? 'flex min-h-12 w-full items-center gap-3 px-3 text-sm font-bold'
          : 'flex min-h-14 flex-col items-center justify-center gap-1 text-[0.68rem] font-bold',
        active
          ? 'bg-ink text-white dark:bg-mint dark:text-ink'
          : 'text-zinc-600 hover:bg-black/5 dark:text-zinc-300 dark:hover:bg-white/10',
      )}
      onClick={onClick}
      title={item.label}
    >
      <Icon size={wide ? 19 : 20} />
      <span className={wide ? '' : 'max-w-full truncate'}>{item.label}</span>
    </button>
  );
}

