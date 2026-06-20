import { RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { BaseDropdown, type DropdownOption } from '../components/BaseDropdown';
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
type MovingAverageConfig = { sourceKey: string; targetKey: string; digits?: number };
type NutritionOverlayConfig = {
  key: string;
  forecastKey: string;
  label: string;
  color: string;
  domain?: [string, string];
};

const MOVING_AVERAGE_DAYS = 7;
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const CHART_RESIZE_DEBOUNCE_MS = 120;
const CALORIES_COLOR = '#ff6b4a';
const PROTEIN_COLOR = '#45d09e';
const BODY_WEIGHT_COLOR = '#4db7d8';
const VOLUME_BAR_COLOR = '#f5c451';
const VOLUME_FORECAST_COLOR = '#a16207';
const RADIUS: [number, number, number, number] = [5, 5, 0, 0];

const NUTRITION_AVERAGE_CONFIGS: MovingAverageConfig[] = [
  { sourceKey: 'calories', targetKey: 'caloriesAvg', digits: 0 },
  { sourceKey: 'protein', targetKey: 'proteinAvg', digits: 1 },
  { sourceKey: 'bodyWeightKg', targetKey: 'bodyWeightAvg', digits: 1 },
];

const WORKOUT_VOLUME_AVERAGE_CONFIGS: MovingAverageConfig[] = [
  { sourceKey: 'workoutVolume', targetKey: 'workoutVolumeAvg', digits: 0 },
];

const SELECTED_EXERCISE_AVERAGE_CONFIGS: MovingAverageConfig[] = [
  { sourceKey: 'reps', targetKey: 'repsAvg', digits: 1 },
];

export default function Progress() {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [nutritionOverlay, setNutritionOverlay] = useState<NutritionOverlay>('bodyWeightKg');
  const [trainingMetric, setTrainingMetric] = useState<TrainingMetric>('volume');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const requestIdRef = useRef(0);

  const load = useCallback(async (showSkeleton = false) => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;

    if (showSkeleton) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }

    setError('');

    try {
      const [nextSummary, nextSettings] = await Promise.all([
        api.progressSummary(84, toIsoDate()),
        api.settings(),
      ]);

      if (requestIdRef.current !== requestId) return;

      setSummary(nextSummary);
      setSettings(nextSettings);
    } catch (err) {
      if (requestIdRef.current !== requestId) return;
      setError(err instanceof Error ? err.message : 'Unable to load progress.');
    } finally {
      if (requestIdRef.current !== requestId) return;
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void load(true);
  }, [load]);

  const handleRefresh = useCallback(() => {
    void load(false);
  }, [load]);

  const handleRetry = useCallback(() => {
    void load(true);
  }, [load]);

  const selectBodyWeight = useCallback(() => {
    setNutritionOverlay('bodyWeightKg');
  }, []);

  const selectProtein = useCallback(() => {
    setNutritionOverlay('protein');
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
      NUTRITION_AVERAGE_CONFIGS,
      MOVING_AVERAGE_DAYS,
    );

    return withForecast(averaged, ['caloriesAvg', 'proteinAvg', 'bodyWeightAvg']);
  }, [summary]);

  const workoutVolumeTrendData = useMemo(() => {
    if (!summary) return [];

    const averaged = withMovingAverages(
      summary.days,
      WORKOUT_VOLUME_AVERAGE_CONFIGS,
      MOVING_AVERAGE_DAYS,
    );

    return withForecast(averaged, ['workoutVolumeAvg']);
  }, [summary]);

  const selectedExerciseName = useMemo(
    () => (trainingMetric === 'volume' ? null : exerciseNameFromMetric(trainingMetric)),
    [trainingMetric],
  );

  const selectedExerciseTarget = useMemo(() => {
    if (!settings || !selectedExerciseName) return null;
    const selectedExerciseNameLower = selectedExerciseName.toLowerCase();

    return settings.exerciseTargets.find(
      (target) => target.exerciseName.toLowerCase() === selectedExerciseNameLower,
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
      SELECTED_EXERCISE_AVERAGE_CONFIGS,
      MOVING_AVERAGE_DAYS,
    );

    return withForecast(averaged, ['repsAvg']);
  }, [selectedExerciseName, summary]);

  const nutritionOverlayConfig: NutritionOverlayConfig = useMemo(
    () => (
      nutritionOverlay === 'protein'
        ? {
            key: 'proteinAvg',
            forecastKey: 'proteinAvgForecast',
            label: 'Protein 7d avg',
            color: PROTEIN_COLOR,
          }
        : {
            key: 'bodyWeightAvg',
            forecastKey: 'bodyWeightAvgForecast',
            label: 'Body weight 7d avg',
            color: BODY_WEIGHT_COLOR,
            domain: ['dataMin - 1', 'dataMax + 1'],
          }
    ),
    [nutritionOverlay],
  );

  const trainingData = trainingMetric === 'volume' ? workoutVolumeTrendData : selectedExerciseTrendData;

  const hasNutritionData = useMemo(
    () => hasMetricData(nutritionTrendData, ['caloriesAvg', nutritionOverlayConfig.key]),
    [nutritionOverlayConfig.key, nutritionTrendData],
  );

  const hasTrainingData = useMemo(
    () => (
      trainingMetric === 'volume'
        ? hasMetricData(workoutVolumeTrendData, ['workoutVolumeAvg'])
        : hasMetricData(selectedExerciseTrendData, ['repsAvg'])
    ),
    [selectedExerciseTrendData, trainingMetric, workoutVolumeTrendData],
  );

  const selectedExerciseTargetReps = selectedExerciseTarget
    ? selectedExerciseTarget.targetTotalReps
      ?? selectedExerciseTarget.targetSets * selectedExerciseTarget.targetRepsPerSet
    : 0;

  const nutritionActions = useMemo(
    () => (
      <div className="inline-flex rounded-lg bg-black/5 p-1 dark:bg-white/10">
        <PillButton
          active={nutritionOverlay === 'bodyWeightKg'}
          label="Body Weight"
          onClick={selectBodyWeight}
        />
        <PillButton
          active={nutritionOverlay === 'protein'}
          label="Protein"
          onClick={selectProtein}
        />
      </div>
    ),
    [nutritionOverlay, selectBodyWeight, selectProtein],
  );

  const trainingActions = useMemo(
    () => {
      const metricOptions: Array<DropdownOption<TrainingMetric>> = [
        { value: 'volume', label: 'Total volume' },
        ...exerciseNames.map((exerciseName) => ({
          value: `exercise:${exerciseName}` as TrainingMetric,
          label: exerciseName,
        })),
      ];

      return (
        <BaseDropdown
          className="w-full min-w-40 max-w-56"
          options={metricOptions}
          value={trainingMetric}
          onChange={(nextMetric) => setTrainingMetric(nextMetric)}
          placeholder="Metric"
          searchPlaceholder="Search metrics"
        />
      );
    },
    [exerciseNames, trainingMetric],
  );

  if (loading) {
    return <Skeleton className="h-[70vh]" />;
  }

  if (error || !summary || !settings) {
    return (
      <section className="panel p-5">
        <p className="font-bold text-ember">{error || 'Progress data unavailable.'}</p>
        <button className="btn btn-primary mt-4" disabled={refreshing} onClick={handleRetry}>
          <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
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
          <button className="btn btn-ghost" disabled={refreshing} onClick={handleRefresh}>
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
        <ChartFrame
          title="Nutrition & Body Trend"
          contentClassName={hasNutritionData ? 'h-80 min-h-80' : ''}
          actions={nutritionActions}
        >
          {hasNutritionData ? (
            <NutritionChart
              data={nutritionTrendData}
              overlay={nutritionOverlay}
              overlayConfig={nutritionOverlayConfig}
              targets={targets}
            />
          ) : (
            <CompactEmpty title="No nutrition or body history yet" />
          )}
        </ChartFrame>

        <ChartFrame
          title="Training Load"
          contentClassName={hasTrainingData ? 'h-80 min-h-80' : ''}
          actions={trainingActions}
        >
          {hasTrainingData ? (
            <TrainingChart
              data={trainingData}
              metric={trainingMetric}
              selectedExerciseTargetReps={selectedExerciseTargetReps}
            />
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

const NutritionChart = memo(function NutritionChart({
  data,
  overlay,
  overlayConfig,
  targets,
}: {
  data: ChartRow[];
  overlay: NutritionOverlay;
  overlayConfig: NutritionOverlayConfig;
  targets: ReturnType<typeof macroTargets> | null;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={22} />
        <YAxis yAxisId="calories" width={42} />
        <YAxis
          yAxisId="overlay"
          orientation="right"
          width={42}
          domain={overlayConfig.domain}
        />
        <Tooltip labelFormatter={formatShortDate} isAnimationActive={false} />
        {targets ? (
          <ReferenceArea
            yAxisId="calories"
            y1={targets.calories * 0.95}
            y2={targets.calories * 1.05}
            fill={CALORIES_COLOR}
            fillOpacity={0.09}
            strokeOpacity={0}
          />
        ) : null}
        {targets && overlay === 'protein' ? (
          <ReferenceArea
            yAxisId="overlay"
            y1={targets.proteinGrams * 0.95}
            y2={targets.proteinGrams * 1.05}
            fill={PROTEIN_COLOR}
            fillOpacity={0.08}
            strokeOpacity={0}
          />
        ) : null}
        <Bar
          yAxisId="calories"
          dataKey="caloriesAvg"
          name="Calories 7d avg"
          fill={CALORIES_COLOR}
          fillOpacity={0.3}
          radius={RADIUS}
          isAnimationActive={false}
        />
        <Line
          yAxisId="calories"
          type="monotone"
          dataKey="caloriesAvgForecast"
          name="Calories forecast"
          stroke={CALORIES_COLOR}
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          yAxisId="overlay"
          type="monotone"
          dataKey={overlayConfig.key}
          name={overlayConfig.label}
          stroke={overlayConfig.color}
          strokeWidth={2.4}
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
        />
        <Line
          yAxisId="overlay"
          type="monotone"
          dataKey={overlayConfig.forecastKey}
          name={`${overlayConfig.label} forecast`}
          stroke={overlayConfig.color}
          strokeWidth={2}
          strokeDasharray="5 5"
          dot={false}
          activeDot={false}
          connectNulls
          isAnimationActive={false}
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
});

const TrainingChart = memo(function TrainingChart({
  data,
  metric,
  selectedExerciseTargetReps,
}: {
  data: ChartRow[];
  metric: TrainingMetric;
  selectedExerciseTargetReps: number;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={22} />
        <YAxis width={42} />
        <Tooltip labelFormatter={formatShortDate} isAnimationActive={false} />
        {metric === 'volume' ? (
          <>
            <Bar
              dataKey="workoutVolumeAvg"
              name="Volume 7d avg"
              fill={VOLUME_BAR_COLOR}
              fillOpacity={0.45}
              radius={RADIUS}
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="workoutVolumeAvgForecast"
              name="Volume forecast"
              stroke={VOLUME_FORECAST_COLOR}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          </>
        ) : (
          <>
            {selectedExerciseTargetReps > 0 ? (
              <ReferenceArea
                y1={selectedExerciseTargetReps * 0.95}
                y2={selectedExerciseTargetReps * 1.05}
                fill={PROTEIN_COLOR}
                fillOpacity={0.08}
                strokeOpacity={0}
              />
            ) : null}
            <Line
              type="monotone"
              dataKey="repsAvg"
              name="Reps 7d avg"
              stroke={PROTEIN_COLOR}
              strokeWidth={2.4}
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
            <Line
              type="monotone"
              dataKey="repsAvgForecast"
              name="Reps forecast"
              stroke={PROTEIN_COLOR}
              strokeWidth={2}
              strokeDasharray="5 5"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          </>
        )}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

const PillButton = memo(function PillButton({
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
});

const CompactEmpty = memo(function CompactEmpty({ title }: { title: string }) {
  return (
    <EmptyState title={title}>
      <span>Data will appear here after saved history exists.</span>
    </EmptyState>
  );
});

function withMovingAverages<T extends object>(
  rows: T[],
  configs: MovingAverageConfig[],
  windowSize: number,
) {
  const sums = configs.map(() => 0);
  const counts = configs.map(() => 0);

  return rows.map((row, index) => {
    const sourceRow = row as ChartRow;
    const next: ChartRow = { ...sourceRow };

    configs.forEach((config, configIndex) => {
      const currentValue = asNumber(sourceRow[config.sourceKey]);

      if (currentValue !== null) {
        sums[configIndex] += currentValue;
        counts[configIndex] += 1;
      }

      if (index >= windowSize) {
        const outgoingRow = rows[index - windowSize] as ChartRow;
        const outgoingValue = asNumber(outgoingRow[config.sourceKey]);

        if (outgoingValue !== null) {
          sums[configIndex] -= outgoingValue;
          counts[configIndex] -= 1;
        }
      }

      next[config.targetKey] = counts[configIndex]
        ? round(sums[configIndex] / counts[configIndex], config.digits ?? 1)
        : null;
    });

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
