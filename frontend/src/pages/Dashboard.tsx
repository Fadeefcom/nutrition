import { Plus, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { ChartFrame } from '../components/ChartFrame';
import { EmptyState } from '../components/EmptyState';
import { ProgressRing } from '../components/ProgressRing';
import { Skeleton } from '../components/Skeleton';
import { StatusPill } from '../components/StatusPill';
import type {
  BodyMetric,
  DailyNutrition,
  DailyStatus,
  DailyWorkout,
  Profile,
  ProgressSummary,
  Settings,
} from '../types/models';
import {
  calculateMaintenanceCalories,
  macroTargets,
  normalizeNutrition,
  normalizeWorkout,
  round,
} from '../utils/calculations';
import { addDays, formatShortDate, toIsoDate } from '../utils/date';
import { withForecast } from '../utils/forecast';

interface DashboardData {
  profile: Profile;
  settings: Settings;
  nutrition: DailyNutrition;
  workout: DailyWorkout;
  metric: BodyMetric;
  todayStatus: DailyStatus;
  yesterdayStatus: DailyStatus;
  summary: ProgressSummary;
}

export default function Dashboard() {
  const today = toIsoDate();
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [nutritionTab, setNutritionTab] = useState<'nutrition' | 'weight'>('nutrition');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [profile, settings, nutrition, workout, metric, todayStatus, yesterdayStatus, summary] =
        await Promise.all([
          api.profile(),
          api.settings(),
          api.nutrition(today),
          api.workout(today),
          api.bodyMetric(today),
          api.dailyStatus(today),
          api.dailyStatus(addDays(today, -1)),
          api.progressSummary(84, today),
        ]);

      setData({
        profile,
        settings,
        nutrition: normalizeNutrition(nutrition),
        workout: normalizeWorkout(workout),
        metric,
        todayStatus,
        yesterdayStatus,
        summary,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load dashboard.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const stats = useMemo(() => {
    if (!data) return null;
    const targets = macroTargets(data.settings.nutritionTarget);
    const lastSeven = data.summary.days.slice(-7);
    const weeklyWorkoutCount = lastSeven.reduce((sum, day) => sum + day.workoutCount, 0);
    const latestWeight = [...data.summary.days].reverse().find((day) => day.bodyWeightKg)?.bodyWeightKg
      ?? data.metric.weightKg
      ?? null;
    const maintenanceCalories = calculateMaintenanceCalories({
      weightKg: latestWeight,
      heightCm: data.profile.heightCm,
      age: data.profile.age,
      sex: data.profile.sex,
      activityMultiplier: data.profile.activityMultiplier,
    });
    let streak = 0;
    for (const status of [...data.summary.statuses].reverse()) {
      if (status.fullDay.state !== 'green') break;
      streak += 1;
    }
    return { targets, weeklyWorkoutCount, latestWeight, maintenanceCalories, streak };
  }, [data]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-36" />
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
          <Skeleton className="h-32" />
        </div>
        <Skeleton className="h-72" />
      </div>
    );
  }

  if (error || !data || !stats) {
    return (
      <section className="panel p-5">
        <p className="font-bold text-ember">{error || 'Dashboard data is unavailable.'}</p>
        <button className="btn btn-primary mt-4" onClick={load}>
          <RefreshCw size={16} />
          Retry
        </button>
      </section>
    );
  }

  const { totals } = data.nutrition;
  const caloriesPercent = round((totals.calories / stats.targets.calories) * 100);
  const calorieProteinData = withForecast(
    data.summary.days.map((day) => ({
      ...day,
      maintenanceCalories: stats.maintenanceCalories,
    })),
    ['calories', 'protein'],
  ).map((day) => ({ ...day, maintenanceCalories: stats.maintenanceCalories }));
  const bodyWeightData = withForecast(data.summary.days, ['bodyWeightKg']);
  const workoutVolumeData = withForecast(data.summary.days, ['workoutVolume']);
  const hasNutritionData = hasMetricData(data.summary.days, ['calories', 'protein']);
  const hasBodyWeightData = hasMetricData(data.summary.days, ['bodyWeightKg']);
  const hasWorkoutVolumeData = hasMetricData(data.summary.days, ['workoutVolume']);

  return (
    <div className="space-y-5">
      <section className="sticky top-[4.75rem] z-20 -mx-4 border-b border-black/10 bg-white/75 px-4 py-3 backdrop-blur-xl dark:border-white/10 dark:bg-black/25 lg:top-0 lg:-mx-8 lg:px-8">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
              {formatShortDate(today)}
            </p>
            <h1 className="text-2xl font-black">Dashboard</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn btn-primary" onClick={() => (window.location.hash = 'nutrition')}>
              <Plus size={17} />
              Food
            </button>
            <button className="btn btn-ghost" onClick={() => (window.location.hash = 'workouts')}>
              <Plus size={17} />
              Workout
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,7fr)_minmax(17rem,3fr)]">
        <div className="space-y-5">
          <section className="panel p-5">
            <div>
              <p className="text-sm font-bold uppercase text-zinc-500 dark:text-zinc-400">
                Macros
              </p>
              <h1 className="mt-1 text-3xl font-black sm:text-4xl">Today</h1>
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 2xl:grid-cols-4">
              <ProgressRing
                value={caloriesPercent}
                label="Calories"
                sublabel={`${Math.round(totals.calories)} / ${stats.targets.calories} kcal`}
                tone="ember"
              />
              <ProgressRing
                value={round((totals.protein / stats.targets.proteinGrams) * 100)}
                label="Protein"
                sublabel={`${round(totals.protein)} / ${stats.targets.proteinGrams} g`}
                tone="mint"
              />
              <ProgressRing
                value={round((totals.carbs / stats.targets.carbsGrams) * 100)}
                label="Carbs"
                sublabel={`${round(totals.carbs)} / ${stats.targets.carbsGrams} g`}
                tone="lagoon"
              />
              <ProgressRing
                value={round((totals.fat / stats.targets.fatGrams) * 100)}
                label="Fat"
                sublabel={`${round(totals.fat)} / ${stats.targets.fatGrams} g`}
                tone="honey"
              />
            </div>
          </section>

          <section className="panel p-4">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Exercise targets
              </h2>
              <StatusPill state={data.todayStatus.workout.state} label={data.todayStatus.workout.state} />
            </div>
            <div className="divide-y divide-black/10 dark:divide-white/10">
              {data.todayStatus.exerciseTargets.map((target) => (
                <div
                  key={target.exerciseName}
                  className="grid gap-3 py-3 md:grid-cols-[minmax(9rem,1fr)_minmax(12rem,2fr)_7rem_auto] md:items-center"
                >
                  <div>
                    <p className="font-bold">{target.exerciseName}</p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">{target.recommendation}</p>
                  </div>
                  <div className="h-2 rounded-full bg-black/10 dark:bg-white/10">
                    <div
                      className="h-full rounded-full bg-mint"
                      style={{ width: `${Math.min(100, target.completionPercent)}%` }}
                    />
                  </div>
                  <p className="text-sm font-bold text-zinc-700 dark:text-zinc-200">
                    {target.completedReps} / {target.targetReps}
                  </p>
                  {target.targetReached ? <StatusPill state="green" label="Reached" /> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="grid gap-4 2xl:grid-cols-2">
            <ChartFrame
              title="Nutrition and body"
              contentClassName={nutritionTab === 'nutrition'
                ? hasNutritionData ? 'h-64 min-h-64' : ''
                : hasBodyWeightData ? 'h-64 min-h-64' : ''}
              actions={
                <div className="inline-flex rounded-lg bg-black/5 p-1 dark:bg-white/10">
                  <TabButton
                    active={nutritionTab === 'nutrition'}
                    label="Calories & Protein"
                    onClick={() => setNutritionTab('nutrition')}
                  />
                  <TabButton
                    active={nutritionTab === 'weight'}
                    label="Body Weight"
                    onClick={() => setNutritionTab('weight')}
                  />
                </div>
              }
            >
              {nutritionTab === 'nutrition' ? (
                hasNutritionData ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={calorieProteinData}>
                      <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                      <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={22} />
                      <YAxis />
                      <Tooltip labelFormatter={formatShortDate} />
                      <Line type="monotone" dataKey="calories" stroke="#ff6b4a" dot={false} strokeWidth={2} />
                      <Line
                        type="monotone"
                        dataKey="caloriesForecast"
                        stroke="#ff6b4a"
                        dot={false}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        connectNulls
                      />
                      <Line type="monotone" dataKey="protein" stroke="#45d09e" dot={false} strokeWidth={2} />
                      <Line
                        type="monotone"
                        dataKey="proteinForecast"
                        stroke="#45d09e"
                        dot={false}
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        connectNulls
                      />
                      <Line
                        type="monotone"
                        dataKey="maintenanceCalories"
                        stroke="#71717a"
                        dot={false}
                        strokeWidth={2}
                        strokeDasharray="2 6"
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <CompactEmpty title="No nutrition history yet" />
                )
              ) : hasBodyWeightData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={bodyWeightData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={22} />
                    <YAxis domain={['dataMin - 1', 'dataMax + 1']} />
                    <Tooltip labelFormatter={formatShortDate} />
                    <Line type="monotone" dataKey="bodyWeightKg" stroke="#4db7d8" dot={false} strokeWidth={2} />
                    <Line
                      type="monotone"
                      dataKey="bodyWeightKgForecast"
                      stroke="#4db7d8"
                      dot={false}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      connectNulls
                    />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <CompactEmpty title="No body-weight history yet" />
              )}
            </ChartFrame>

            <ChartFrame
              title="Training"
              contentClassName={hasWorkoutVolumeData ? 'h-64 min-h-64' : ''}
              actions={
                <div className="inline-flex rounded-lg bg-black/5 p-1 dark:bg-white/10">
                  <TabButton active label="Weekly Volume" />
                </div>
              }
            >
              {hasWorkoutVolumeData ? (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={workoutVolumeData}>
                    <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                    <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={18} />
                    <YAxis />
                    <Tooltip labelFormatter={formatShortDate} />
                    <Bar dataKey="workoutVolume" fill="#f5c451" radius={[6, 6, 0, 0]} />
                    <Line
                      type="monotone"
                      dataKey="workoutVolumeForecast"
                      stroke="#a16207"
                      dot={false}
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      connectNulls
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              ) : (
                <CompactEmpty title="No workout volume history yet" />
              )}
            </ChartFrame>
          </section>
        </div>

        <aside className="panel p-4 xl:sticky xl:top-24 xl:self-start">
          <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
            Summary
          </h2>
          <div className="divide-y divide-black/10 text-sm dark:divide-white/10">
            <SidebarRow label="Latest weight" value={stats.latestWeight ? `${stats.latestWeight} kg` : 'No data'} />
            <SidebarRow label="Weekly workouts" value={String(stats.weeklyWorkoutCount)} />
            <SidebarRow label="Current streak" value={`${stats.streak} days`} />
            <SidebarRow
              label="Maintenance"
              value={stats.maintenanceCalories ? `${stats.maintenanceCalories} kcal` : 'Need data'}
            />
            <SidebarRow
              label="Yesterday"
              value={<StatusPill state={data.yesterdayStatus.fullDay.state} label={data.yesterdayStatus.fullDay.state} />}
            />
            <SidebarRow
              label="Calories"
              value={<StatusPill state={data.yesterdayStatus.calories.state} label={data.yesterdayStatus.calories.state} />}
            />
            <SidebarRow
              label="Protein"
              value={<StatusPill state={data.yesterdayStatus.protein.state} label={data.yesterdayStatus.protein.state} />}
            />
            <SidebarRow
              label="Workout"
              value={<StatusPill state={data.yesterdayStatus.workout.state} label={data.yesterdayStatus.workout.state} />}
            />
          </div>
        </aside>
      </section>
    </div>
  );
}

function TabButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick?: () => void;
}) {
  return (
    <button
      className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
        active
          ? 'bg-white text-zinc-950 shadow-sm dark:bg-white/15 dark:text-white'
          : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function SidebarRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-3">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="text-right font-bold text-zinc-950 dark:text-white">{value}</span>
    </div>
  );
}

function CompactEmpty({ title }: { title: string }) {
  return (
    <EmptyState title={title}>
      <span>Data will appear here after the first saved entries.</span>
    </EmptyState>
  );
}

function hasMetricData(rows: object[], keys: string[]) {
  return rows.some((row) =>
    keys.some((key) => {
      const value = (row as Record<string, unknown>)[key];
      return typeof value === 'number' && Number.isFinite(value) && value > 0;
    }),
  );
}
