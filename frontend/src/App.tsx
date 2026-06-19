import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useMemo, useState } from 'react';
import { AppShell } from './components/AppShell';
import Dashboard from './pages/Dashboard';
import Nutrition from './pages/Nutrition';
import Products from './pages/Products';
import Progress from './pages/Progress';
import Settings from './pages/Settings';
import Workouts from './pages/Workouts';
import type { PageId } from './types/models';

const pages: Record<PageId, JSX.Element> = {
  dashboard: <Dashboard />,
  workouts: <Workouts />,
  nutrition: <Nutrition />,
  products: <Products />,
  progress: <Progress />,
  settings: <Settings />,
};

const validPages = Object.keys(pages) as PageId[];

export default function App() {
  const [page, setPage] = useState<PageId>(() => pageFromHash());
  const [darkMode, setDarkMode] = useState(() => {
    const stored = localStorage.getItem('theme');
    return stored ? stored === 'dark' : true;
  });

  useEffect(() => {
    const onHashChange = () => setPage(pageFromHash());
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  useEffect(() => {
    document.documentElement.classList.toggle('dark', darkMode);
    localStorage.setItem('theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  const content = useMemo(() => pages[page], [page]);

  return (
    <AppShell
      page={page}
      darkMode={darkMode}
      onToggleTheme={() => setDarkMode((value) => !value)}
      onNavigate={(next) => {
        window.location.hash = next;
        setPage(next);
      }}
    >
      <AnimatePresence mode="wait">
        <motion.div
          key={page}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.22 }}
        >
          {content}
        </motion.div>
      </AnimatePresence>
    </AppShell>
  );
}

function pageFromHash(): PageId {
  const hash = window.location.hash.replace('#', '') as PageId;
  return validPages.includes(hash) ? hash : 'dashboard';
}

