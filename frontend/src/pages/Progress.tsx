import { RefreshCw } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceArea,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { api } from '../api/client';
import { ChartFrame } from '../components/ChartFrame';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import type { ProgressSummary, Settings } from '../types/models';
import { macroTargets, round } from '../utils/calculations';
import { formatShortDate, toIsoDate } from '../utils/date';
import { withForecast } from '../utils/forecast';

type NutritionOverlay = 'bodyWeightKg' | 'protein';
type TrainingMetric = 'volume' | `exercise:${string}`;
type ChartRow = Record<string, string | number | null | undefined>;
type NutritionOverlayConfig = {
  key: string;
  forecastKey: string;
  label: string;
  color: string;
  domain?: [string, string];
};

const MOVING_AVERAGE_DAYS = 7;

export default function Progress() {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nutritionOverlay, setNutritionOverlay] = useState<NutritionOverlay>('bodyWeightKg');
  const [trainingMetric, setTrainingMetric] = useState<TrainingMetric>('volume');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const [nextSummary, nextSettings] = await Promise.all([
        api.progressSummary(84, toIsoDate()),
        api.settings(),
      ]);
      setSummary(nextSummary);
      setSettings(nextSettings);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load progress.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const exerciseNames = useMemo(
    () => Object.keys(summary?.exercises ?? {}).sort((a, b) => a.localeCompare(b)),
    [summary],
  );

  useEffect(() => {
    if (trainingMetric === 'volume') return;
    const selectedExercise = exerciseNameFromMetric(trainingMetric);
    if (!exerciseNames.includes(selectedExercise)) {
      setTrainingMetric('volume');
    }
  }, [exerciseNames, trainingMetric]);

  const targets = useMemo(
    () => (settings ? macroTargets(settings.nutritionTarget) : null),
    [settings],
  );

  const nutritionTrendData = useMemo(() => {
    if (!summary) return [];

    const averaged = withMovingAverages(
      summary.days,
      [
        { sourceKey: 'calories', targetKey: 'caloriesAvg', digits: 0 },
        { sourceKey: 'protein', targetKey: 'proteinAvg', digits: 1 },
        { sourceKey: 'bodyWeightKg', targetKey: 'bodyWeightAvg', digits: 1 },
      ],
      MOVING_AVERAGE_DAYS,
    );

    return withForecast(averaged, [
      'caloriesAvg',
      nutritionOverlay === 'protein' ? 'proteinAvg' : 'bodyWeightAvg',
    ]);
  }, [nutritionOverlay, summary]);

  const workoutVolumeTrendData = useMemo(() => {
    if (!summary) return [];

    const averaged = withMovingAverages(
      summary.days,
      [{ sourceKey: 'workoutVolume', targetKey: 'workoutVolumeAvg', digits: 0 }],
      MOVING_AVERAGE_DAYS,
    );

    return withForecast(averaged, ['workoutVolumeAvg']);
  }, [summary]);

  const selectedExerciseName =
    trainingMetric === 'volume' ? null : exerciseNameFromMetric(trainingMetric);

  const selectedExerciseTarget = useMemo(() => {
    if (!settings || !selectedExerciseName) return null;
    return settings.exerciseTargets.find(
      (target) => target.exerciseName.toLowerCase() === selectedExerciseName.toLowerCase(),
    ) ?? null;
  }, [selectedExerciseName, settings]);

  const selectedExerciseTrendData = useMemo(() => {
    if (!summary || !selectedExerciseName) return [];

    const points = summary.exercises[selectedExerciseName] ?? [];
    const rows = points.map((point) => ({
      date: point.date,
      reps: point.reps,
      bestSet: point.bestSet,
      volume: point.volume,
    }));

    const averaged = withMovingAverages(
      rows,
      [{ sourceKey: 'reps', targetKey: 'repsAvg', digits: 1 }],
      MOVING_AVERAGE_DAYS,
    );

    return withForecast(averaged, ['repsAvg']);
  }, [selectedExerciseName, summary]);

  const nutritionOverlayConfig: NutritionOverlayConfig =
    nutritionOverlay === 'protein'
      ? {
          key: 'proteinAvg',
          forecastKey: 'proteinAvgForecast',
          label: 'Protein 7d avg',
          color: '#45d09e',
        }
      : {
          key: 'bodyWeightAvg',
          forecastKey: 'bodyWeightAvgForecast',
          label: 'Body weight 7d avg',
          color: '#4db7d8',
          domain: ['dataMin - 1', 'dataMax + 1'],
        };

  const trainingData =
    trainingMetric === 'volume' ? workoutVolumeTrendData : selectedExerciseTrendData;

  const hasNutritionData = hasMetricData(nutritionTrendData, [
    'caloriesAvg',
    nutritionOverlayConfig.key,
  ]);
  const hasTrainingData =
    trainingMetric === 'volume'
      ? hasMetricData(workoutVolumeTrendData, ['workoutVolumeAvg'])
      : hasMetricData(selectedExerciseTrendData, ['repsAvg']);

  const selectedExerciseTargetReps =
    selectedExerciseTarget?.targetTotalReps
    || (selectedExerciseTarget
      ? selectedExerciseTarget.targetSets * selectedExerciseTarget.targetRepsPerSet
      : 0);

  if (loading) {
    return <Skeleton className="h-[70vh]" />;
  }

  if (error || !summary || !settings) {
    return (
      <section className="panel p-5">
        <p className="font-bold text-ember">{error || 'Progress data unavailable.'}</p>
        <button className="btn btn-primary mt-4" onClick={load}>
          <RefreshCw size={16} />
          Retry
        </button>
      </section>
    );
  }

  return (
    <div className="space-y-5">
      <section className="panel p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold uppercase text-zinc-500 dark:text-zinc-400">
              {MOVING_AVERAGE_DAYS}-day moving average
            </p>
            <h1 className="text-2xl font-black">Progress</h1>
          </div>
          <button className="btn btn-ghost" onClick={load}>
            <RefreshCw size={16} />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <ChartFrame
          title="Nutrition & Body Trend"
          contentClassName={hasNutritionData ? 'h-80 min-h-80' : ''}
          actions={
            <div className="inline-flex rounded-lg bg-black/5 p-1 dark:bg-white/10">
              <PillButton
                active={nutritionOverlay === 'bodyWeightKg'}
                label="Body Weight"
                onClick={() => setNutritionOverlay('bodyWeightKg')}
              />
              <PillButton
                active={nutritionOverlay === 'protein'}
                label="Protein"
                onClick={() => setNutritionOverlay('protein')}
              />
            </div>
          }
        >
          {hasNutritionData ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={nutritionTrendData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={22} />
                <YAxis yAxisId="calories" />
                <YAxis
                  yAxisId="overlay"
                  orientation="right"
                  domain={nutritionOverlayConfig.domain}
                />
                <Tooltip labelFormatter={formatShortDate} />
                {targets ? (
                  <ReferenceArea
                    yAxisId="calories"
                    y1={targets.calories * 0.95}
                    y2={targets.calories * 1.05}
                    fill="#ff6b4a"
                    fillOpacity={0.09}
                    strokeOpacity={0}
                  />
                ) : null}
                {targets && nutritionOverlay === 'protein' ? (
                  <ReferenceArea
                    yAxisId="overlay"
                    y1={targets.proteinGrams * 0.95}
                    y2={targets.proteinGrams * 1.05}
                    fill="#45d09e"
                    fillOpacity={0.08}
                    strokeOpacity={0}
                  />
                ) : null}
                <Bar
                  yAxisId="calories"
                  dataKey="caloriesAvg"
                  name="Calories 7d avg"
                  fill="#ff6b4a"
                  fillOpacity={0.3}
                  radius={[5, 5, 0, 0]}
                />
                <Line
                  yAxisId="calories"
                  type="monotone"
                  dataKey="caloriesAvgForecast"
                  name="Calories forecast"
                  stroke="#ff6b4a"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="overlay"
                  type="monotone"
                  dataKey={nutritionOverlayConfig.key}
                  name={nutritionOverlayConfig.label}
                  stroke={nutritionOverlayConfig.color}
                  strokeWidth={2.4}
                  dot={false}
                  connectNulls
                />
                <Line
                  yAxisId="overlay"
                  type="monotone"
                  dataKey={nutritionOverlayConfig.forecastKey}
                  name={`${nutritionOverlayConfig.label} forecast`}
                  stroke={nutritionOverlayConfig.color}
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  dot={false}
                  connectNulls
                />
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <CompactEmpty title="No nutrition or body history yet" />
          )}
        </ChartFrame>

        <ChartFrame
          title="Training Load"
          contentClassName={hasTrainingData ? 'h-80 min-h-80' : ''}
          actions={
            <select
              className="field h-9 min-h-9 w-full min-w-40 max-w-56 py-1 text-xs font-bold"
              value={trainingMetric}
              onChange={(event) => setTrainingMetric(event.target.value as TrainingMetric)}
            >
              <option value="volume">Total volume</option>
              {exerciseNames.map((exerciseName) => (
                <option key={exerciseName} value={`exercise:${exerciseName}`}>
                  {exerciseName}
                </option>
              ))}
            </select>
          }
        >
          {hasTrainingData ? (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={trainingData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
                <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={22} />
                <YAxis />
                <Tooltip labelFormatter={formatShortDate} />
                {trainingMetric === 'volume' ? (
                  <>
                    <Bar
                      dataKey="workoutVolumeAvg"
                      name="Volume 7d avg"
                      fill="#f5c451"
                      fillOpacity={0.45}
                      radius={[5, 5, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="workoutVolumeAvgForecast"
                      name="Volume forecast"
                      stroke="#a16207"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                    />
                  </>
                ) : (
                  <>
                    {selectedExerciseTargetReps > 0 ? (
                      <ReferenceArea
                        y1={selectedExerciseTargetReps * 0.95}
                        y2={selectedExerciseTargetReps * 1.05}
                        fill="#45d09e"
                        fillOpacity={0.08}
                        strokeOpacity={0}
                      />
                    ) : null}
                    <Line
                      type="monotone"
                      dataKey="repsAvg"
                      name="Reps 7d avg"
                      stroke="#45d09e"
                      strokeWidth={2.4}
                      dot={false}
                      connectNulls
                    />
                    <Line
                      type="monotone"
                      dataKey="repsAvgForecast"
                      name="Reps forecast"
                      stroke="#45d09e"
                      strokeWidth={2}
                      strokeDasharray="5 5"
                      dot={false}
                      connectNulls
                    />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          ) : (
            <CompactEmpty
              title={
                trainingMetric === 'volume'
                  ? 'No workout volume history yet'
                  : 'No exercise progression history yet'
              }
            />
          )}
        </ChartFrame>
      </section>
    </div>
  );
}

function PillButton({
  active,
  label,
  onClick,
}: {
  active: boolean;
  label: string;
  onClick: () => void;
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

function CompactEmpty({ title }: { title: string }) {
  return (
    <EmptyState title={title}>
      <span>Data will appear here after saved history exists.</span>
    </EmptyState>
  );
}

function withMovingAverages<T extends object>(
  rows: T[],
  configs: Array<{ sourceKey: string; targetKey: string; digits?: number }>,
  windowSize: number,
) {
  return rows.map((row, index) => {
    const next: ChartRow = { ...(row as ChartRow) };

    for (const config of configs) {
      const values = rows
        .slice(Math.max(0, index - windowSize + 1), index + 1)
        .map((item) => asNumber((item as ChartRow)[config.sourceKey]))
        .filter((value): value is number => value !== null);

      next[config.targetKey] = values.length
        ? round(values.reduce((sum, value) => sum + value, 0) / values.length, config.digits ?? 1)
        : null;
    }

    return next;
  });
}

function hasMetricData(rows: object[], keys: string[]) {
  return rows.some((row) =>
    keys.some((key) => {
      const value = (row as ChartRow)[key];
      return typeof value === 'number' && Number.isFinite(value) && value > 0;
    }),
  );
}

function exerciseNameFromMetric(metric: TrainingMetric) {
  return metric.replace(/^exercise:/, '');
}

function asNumber(value: string | number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
