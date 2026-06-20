import { RefreshCw } from 'lucide-react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
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
import type { Profile, ProgressSummary, Settings } from '../types/models';
import { macroTargets, round } from '../utils/calculations';
import { formatShortDate, toIsoDate } from '../utils/date';
import { withForecast } from '../utils/forecast';

type DateRangeOption = '7D' | '1M' | '3M' | 'YTD' | 'ALL';
type ChartRow = Record<string, string | number | null | undefined>;
type MovingAverageConfig = { sourceKey: string; targetKey: string; digits?: number };
type TooltipRow = {
  key: string;
  color: string;
  label: string;
  value: string;
  reference: boolean;
  group: 'Weight' | 'Calories';
};

const MOVING_AVERAGE_DAYS = 7;
const CHART_MARGIN = { top: 8, right: 8, left: 0, bottom: 0 };
const CHART_RESIZE_DEBOUNCE_MS = 120;
const PROGRESS_HISTORY_DAYS = 3650;
const DATE_RANGE_OPTIONS: DateRangeOption[] = ['7D', '1M', '3M', 'YTD', 'ALL'];
const CALORIES_COLOR = '#F97316';
const CALORIES_FORECAST_COLOR = 'rgba(249, 115, 22, 0.45)';
const MAINTENANCE_COLOR = '#22C55E';
const BODY_WEIGHT_COLOR = '#38BDF8';
const BODY_WEIGHT_FORECAST_COLOR = 'rgba(56, 189, 248, 0.45)';
const TARGET_WEIGHT_COLOR = '#A78BFA';
const RADIUS: [number, number, number, number] = [5, 5, 0, 0];
const ZERO_RADIUS: [number, number, number, number] = [0, 0, 0, 0];
const EXERCISE_COLORS = [
  '#38BDF8',
  '#F97316',
  '#22C55E',
  '#A78BFA',
  '#FACC15',
  '#FB7185',
  '#2DD4BF',
  '#C084FC',
];

const NUTRITION_AVERAGE_CONFIGS: MovingAverageConfig[] = [
  { sourceKey: 'calories', targetKey: 'caloriesAvg', digits: 0 },
];

export default function Progress() {
  const [summary, setSummary] = useState<ProgressSummary | null>(null);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [dateRange, setDateRange] = useState<DateRangeOption>('3M');
  const [activeExercises, setActiveExercises] = useState<string[]>([]);
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
      const [nextSummary, nextSettings, nextProfile] = await Promise.all([
        api.progressSummary(PROGRESS_HISTORY_DAYS, toIsoDate()),
        api.settings(),
        api.profile(),
      ]);

      if (requestIdRef.current !== requestId) return;

      setSummary(nextSummary);
      setSettings(nextSettings);
      setProfile(nextProfile);
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

  const exerciseNames = useMemo(
    () => Object.keys(summary?.exercises ?? {}).sort((a, b) => a.localeCompare(b)),
    [summary],
  );

  useEffect(() => {
    setActiveExercises((current) => {
      const available = exerciseNames.filter((name) => current.includes(name));
      return available.length > 0 ? available : exerciseNames;
    });
  }, [exerciseNames]);

  const targets = useMemo(
    () => (settings ? macroTargets(settings.nutritionTarget) : null),
    [settings],
  );
  const maintenanceCalories = settings
    ? Math.max(0, settings.nutritionTarget.targetCalories - settings.nutritionTarget.calorieAdjustment)
    : null;
  const targetWeightKg = profile?.targetWeightKg && profile.targetWeightKg > 0
    ? profile.targetWeightKg
    : null;

  const nutritionTrendData = useMemo(() => {
    if (!summary) return [];
    const baseRows = trimLeadingEmptyRows(summary.days, ['calories', 'bodyWeightKg']).map((row) => ({
      ...row,
      calories: positiveNumberOrNull(row.calories),
    }));
    const rangedRows = filterRowsByRange(baseRows, dateRange);
    const aggregated = shouldAggregateRange(dateRange);
    const rows = aggregated
      ? aggregateRowsByWeek(rangedRows, [
          { sourceKey: 'calories', targetKey: 'calories', digits: 0 },
          { sourceKey: 'bodyWeightKg', targetKey: 'bodyWeightKg', digits: 1 },
        ])
      : rangedRows;

    const averaged = aggregated
      ? rows.map((row) => ({ ...row, caloriesAvg: row.calories }))
      : withMovingAverages(
          rows,
          NUTRITION_AVERAGE_CONFIGS,
          MOVING_AVERAGE_DAYS,
        );

    return withForecast(averaged, ['caloriesAvg', 'bodyWeightKg']);
  }, [dateRange, summary]);

  const trainingData = useMemo(() => {
    if (!summary) return [];
    const rowsByDate = new Map<string, ChartRow>();
    for (const exerciseName of exerciseNames) {
      for (const point of summary.exercises[exerciseName] ?? []) {
        const row = rowsByDate.get(point.date) ?? { date: point.date };
        row[exerciseKey(exerciseName)] = round((asNumber(row[exerciseKey(exerciseName)]) ?? 0) + trainingLoadValue(point), 1);
        rowsByDate.set(point.date, row);
      }
    }

    const rows = Array.from(rowsByDate.values()).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const rangedRows = filterRowsByRange(rows, dateRange);
    return shouldAggregateRange(dateRange)
      ? aggregateTrainingRowsByWeek(rangedRows, exerciseNames)
      : rangedRows;
  }, [dateRange, exerciseNames, summary]);

  const hasNutritionData = useMemo(
    () => hasMetricData(nutritionTrendData, ['caloriesAvg', 'bodyWeightKg']),
    [nutritionTrendData],
  );

  const hasTrainingData = useMemo(
    () => hasMetricData(trainingData, activeExercises.map(exerciseKey)),
    [activeExercises, trainingData],
  );

  const trainingActions = useMemo(
    () => (
      <ExerciseLegend
        exerciseNames={exerciseNames}
        activeExercises={activeExercises}
        onToggle={(exerciseName) =>
          setActiveExercises((current) =>
            current.includes(exerciseName)
              ? current.filter((name) => name !== exerciseName)
              : [...current, exerciseName],
          )
        }
      />
    ),
    [activeExercises, exerciseNames],
  );

  if (loading) {
    return <Skeleton className="h-[70vh]" />;
  }

  if (error || !summary || !settings || !profile) {
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
              {shouldAggregateRange(dateRange) ? 'Weekly aggregate' : `${MOVING_AVERAGE_DAYS}-day moving average`}
            </p>
            <h1 className="text-2xl font-black">Progress</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <RangePicker value={dateRange} onChange={setDateRange} />
            <button className="btn btn-ghost" disabled={refreshing} onClick={handleRefresh}>
              <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
              Refresh
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4">
        <ChartFrame
          title="Calories & Weight Trend"
          contentClassName={hasNutritionData ? 'h-[28rem] min-h-[28rem]' : ''}
        >
          {hasNutritionData ? (
            <NutritionChart
              data={nutritionTrendData}
              targets={targets}
              maintenanceCalories={maintenanceCalories}
              targetWeightKg={targetWeightKg}
            />
          ) : (
            <CompactEmpty title="No nutrition or body history yet" />
          )}
        </ChartFrame>

        <ChartFrame
          title="Training Load"
          contentClassName={hasTrainingData ? 'h-[28rem] min-h-[28rem]' : ''}
          actions={trainingActions}
        >
          {hasTrainingData ? (
            <TrainingChart
              data={trainingData}
              exerciseNames={exerciseNames}
              activeExercises={activeExercises}
            />
          ) : (
            <CompactEmpty title="No workout volume history yet" />
          )}
        </ChartFrame>
      </section>
    </div>
  );
}

const NutritionChart = memo(function NutritionChart({
  data,
  targets,
  maintenanceCalories,
  targetWeightKg,
}: {
  data: ChartRow[];
  targets: ReturnType<typeof macroTargets> | null;
  maintenanceCalories: number | null;
  targetWeightKg: number | null;
}) {
  const chartData = useMemo(
    () =>
      data.map((row) => ({
        ...row,
        maintenanceCalories,
        targetWeightKg,
      })),
    [data, maintenanceCalories, targetWeightKg],
  );

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
      <ComposedChart data={chartData} margin={CHART_MARGIN}>
          <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
          <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={22} />
          <YAxis yAxisId="calories" width={46} />
          <YAxis
            yAxisId="weight"
            orientation="right"
            width={46}
            domain={['dataMin - 1', 'dataMax + 1']}
          />
          <Tooltip content={<ProgressTooltip />} cursor={{ stroke: 'var(--chart-cursor)', strokeWidth: 1 }} />
          <Legend verticalAlign="top" height={28} iconType="line" />
          {targets ? (
            <ReferenceArea
              yAxisId="calories"
              y1={targets.calories * 0.95}
              y2={targets.calories * 1.05}
              fill={CALORIES_COLOR}
              fillOpacity={0.05}
              strokeOpacity={0}
            />
          ) : null}
          {maintenanceCalories ? (
            <Line
              yAxisId="calories"
              type="monotone"
              dataKey="maintenanceCalories"
              name="Maintenance calories"
              stroke={MAINTENANCE_COLOR}
              strokeWidth={1.8}
              strokeDasharray="6 5"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          ) : null}
          <Line
            yAxisId="calories"
            type="monotone"
            dataKey="caloriesAvg"
            name="Actual calories"
            stroke={CALORIES_COLOR}
            strokeWidth={2.6}
            dot={{ r: 2.5, fill: CALORIES_COLOR, strokeWidth: 0 }}
            activeDot={{ r: 4 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="calories"
            type="monotone"
            dataKey="caloriesAvgForecast"
            name="Calories forecast"
            stroke={CALORIES_FORECAST_COLOR}
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={false}
            activeDot={false}
            connectNulls
            isAnimationActive={false}
          />
          {targetWeightKg ? (
            <Line
              yAxisId="weight"
              type="monotone"
              dataKey="targetWeightKg"
              name="Target weight"
              stroke={TARGET_WEIGHT_COLOR}
              strokeWidth={1.8}
              strokeDasharray="6 5"
              dot={false}
              activeDot={false}
              connectNulls
              isAnimationActive={false}
            />
          ) : null}
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="bodyWeightKg"
            name="Actual weight"
            stroke={BODY_WEIGHT_COLOR}
            strokeWidth={2.8}
            dot={{ r: 3.5, fill: BODY_WEIGHT_COLOR, stroke: '#0f172a', strokeWidth: 1 }}
            activeDot={{ r: 5 }}
            connectNulls
            isAnimationActive={false}
          />
          <Line
            yAxisId="weight"
            type="monotone"
            dataKey="bodyWeightKgForecast"
            name="Weight forecast"
            stroke={BODY_WEIGHT_FORECAST_COLOR}
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
  exerciseNames,
  activeExercises,
}: {
  data: ChartRow[];
  exerciseNames: string[];
  activeExercises: string[];
}) {
  const visibleExercises = exerciseNames.filter((exerciseName) => activeExercises.includes(exerciseName));

  return (
    <ResponsiveContainer width="100%" height="100%" debounce={CHART_RESIZE_DEBOUNCE_MS}>
      <ComposedChart data={data} margin={CHART_MARGIN}>
        <CartesianGrid strokeDasharray="3 3" opacity={0.18} />
        <XAxis dataKey="date" tickFormatter={formatShortDate} minTickGap={22} />
        <YAxis width={46} />
        <Tooltip
          content={<TrainingTooltip exerciseNames={visibleExercises} />}
          cursor={{ fill: 'var(--chart-cursor)' }}
        />
        {visibleExercises.map((exerciseName, index) => (
          <Bar
            key={exerciseName}
            stackId="training-load"
            dataKey={exerciseKey(exerciseName)}
            name={exerciseName}
            fill={exerciseColor(exerciseName, exerciseNames)}
            fillOpacity={0.82}
            radius={index === visibleExercises.length - 1 ? RADIUS : ZERO_RADIUS}
            isAnimationActive={false}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
});

const RangePicker = memo(function RangePicker({
  value,
  onChange,
}: {
  value: DateRangeOption;
  onChange: (value: DateRangeOption) => void;
}) {
  return (
    <div className="inline-flex rounded-lg bg-black/5 p-1 dark:bg-white/10">
      {DATE_RANGE_OPTIONS.map((option) => (
        <button
          key={option}
          className={`rounded-md px-2.5 py-1.5 text-xs font-bold transition ${
            value === option
              ? 'bg-white text-zinc-950 shadow-sm dark:bg-white/15 dark:text-white'
              : 'text-zinc-500 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-white'
          }`}
          onClick={() => onChange(option)}
          type="button"
        >
          {option}
        </button>
      ))}
    </div>
  );
});

const ExerciseLegend = memo(function ExerciseLegend({
  exerciseNames,
  activeExercises,
  onToggle,
}: {
  exerciseNames: string[];
  activeExercises: string[];
  onToggle: (exerciseName: string) => void;
}) {
  return (
    <div className="flex max-w-full flex-wrap justify-end gap-1.5">
      {exerciseNames.map((exerciseName) => {
        const active = activeExercises.includes(exerciseName);
        return (
          <button
            key={exerciseName}
            className={`inline-flex min-h-8 items-center gap-2 rounded-md border px-2 text-xs font-bold transition ${
              active
                ? 'border-white/15 bg-white text-zinc-950 dark:bg-white/15 dark:text-white'
                : 'border-black/10 bg-black/5 text-zinc-500 opacity-65 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400'
            }`}
            onClick={() => onToggle(exerciseName)}
            type="button"
          >
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: exerciseColor(exerciseName, exerciseNames) }}
            />
            {exerciseName}
          </button>
        );
      })}
    </div>
  );
});

function TrainingTooltip({
  active,
  label,
  payload,
  exerciseNames,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ color?: string; dataKey?: string | number; name?: string; value?: unknown }>;
  exerciseNames: string[];
}) {
  if (!active || !payload?.length) return null;

  const rows = payload
    .map((item) => {
      const key = String(item.dataKey ?? '');
      const value = typeof item.value === 'number' ? item.value : null;
      if (value === null || !Number.isFinite(value) || value <= 0) return null;
      return {
        key,
        label: item.name ?? exerciseNameFromKey(key),
        value,
        color: item.color ?? exerciseColor(exerciseNameFromKey(key), exerciseNames),
      };
    })
    .filter((item): item is { key: string; label: string; value: number; color: string } => item !== null)
    .sort((a, b) => b.value - a.value);

  if (rows.length === 0) return null;

  return (
    <div className="max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] p-3 text-[var(--chart-tooltip-text)] shadow-[var(--chart-tooltip-shadow)]">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--chart-tooltip-muted)]">
        {formatShortDate(String(label ?? ''))}
      </p>
      <div className="space-y-1">
        {rows.map((row) => (
          <div key={row.key} className="flex items-center justify-between gap-4 text-xs">
            <span className="flex min-w-0 items-center gap-2">
              <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ backgroundColor: row.color }} />
              <span className="truncate text-[var(--chart-tooltip-muted)]">{row.label}</span>
            </span>
            <span className="font-black tabular-nums" style={{ color: row.color }}>
              {Math.round(row.value).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProgressTooltip({
  active,
  label,
  payload,
}: {
  active?: boolean;
  label?: string | number;
  payload?: Array<{ color?: string; dataKey?: string | number; name?: string; value?: unknown }>;
}) {
  if (!active || !payload?.length) return null;

  const rows = payload
    .map((item): TooltipRow | null => {
      const key = String(item.dataKey ?? '');
      const value = typeof item.value === 'number' ? item.value : null;
      if (!isTooltipValue(key, value)) return null;

      return {
        key,
        color: item.color ?? colorForTooltipKey(key),
        label: item.name ?? labelForTooltipKey(key),
        value: formatTooltipValue(key, value),
        reference: key === 'targetWeightKg' || key === 'maintenanceCalories',
        group: key.toLowerCase().includes('weight') ? 'Weight' : 'Calories',
      };
    })
    .filter((item): item is TooltipRow => item !== null);

  if (rows.length === 0) return null;

  return (
    <div className="max-w-[min(18rem,calc(100vw-2rem))] rounded-lg border border-[var(--chart-tooltip-border)] bg-[var(--chart-tooltip-bg)] p-3 text-[var(--chart-tooltip-text)] shadow-[var(--chart-tooltip-shadow)]">
      <p className="mb-2 text-xs font-black uppercase tracking-wide text-[var(--chart-tooltip-muted)]">
        {formatShortDate(String(label ?? ''))}
      </p>
      {(['Weight', 'Calories'] as const).map((group) => {
        const groupRows = rows.filter((row) => row.group === group);
        if (groupRows.length === 0) return null;

        return (
          <div key={group} className="mb-2 last:mb-0">
            <p className="mb-1 text-[0.7rem] font-black uppercase tracking-wide text-[var(--chart-tooltip-muted)]">
              {group}
            </p>
            <div className="space-y-1">
              {groupRows.map((row) => (
                <div key={row.key} className="flex items-center justify-between gap-4 text-xs">
                  <span className="flex min-w-0 items-center gap-2">
                    <span
                      className={`h-0 w-4 shrink-0 border-t-2 ${row.reference ? 'border-dashed' : ''}`}
                      style={{ borderColor: row.color }}
                    />
                    <span className="truncate text-[var(--chart-tooltip-muted)]">{row.label}</span>
                  </span>
                  <span className="font-black tabular-nums" style={{ color: row.color }}>
                    {row.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

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

function trimLeadingEmptyRows<T extends object>(rows: T[], keys: string[]) {
  const firstDataIndex = rows.findIndex((row) =>
    keys.some((key) => {
      const value = asNumber((row as ChartRow)[key]);
      return value !== null && value > 0;
    }),
  );

  return firstDataIndex > 0 ? rows.slice(firstDataIndex) : rows;
}

function positiveNumberOrNull(value: string | number | null | undefined) {
  const numberValue = asNumber(value);
  return numberValue !== null && numberValue > 0 ? numberValue : null;
}

function filterRowsByRange<T extends object>(rows: T[], range: DateRangeOption) {
  if (range === 'ALL' || rows.length === 0) return rows;

  const lastDate = parseDateOnly(String((rows[rows.length - 1] as ChartRow).date));
  const startDate = range === 'YTD'
    ? new Date(Date.UTC(lastDate.getUTCFullYear(), 0, 1))
    : addUtcDays(lastDate, -rangeDays(range) + 1);

  return rows.filter((row) => parseDateOnly(String((row as ChartRow).date)) >= startDate);
}

function shouldAggregateRange(range: DateRangeOption) {
  return range !== '7D';
}

function rangeDays(range: DateRangeOption) {
  switch (range) {
    case '1M':
      return 30;
    case '3M':
      return 90;
    default:
      return 7;
  }
}

function aggregateRowsByWeek(rows: ChartRow[], configs: MovingAverageConfig[]) {
  const groups = new Map<string, ChartRow[]>();
  for (const row of rows) {
    const key = weekKey(String(row.date));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.values()).map((group) => {
    const next: ChartRow = { date: String(group[group.length - 1].date) };
    for (const config of configs) {
      const values = group
        .map((row) => asNumber(row[config.sourceKey]))
        .filter((value): value is number => value !== null && value > 0);
      next[config.targetKey] = values.length
        ? round(values.reduce((sum, value) => sum + value, 0) / values.length, config.digits ?? 1)
        : null;
    }
    return next;
  });
}

function aggregateTrainingRowsByWeek(rows: ChartRow[], exerciseNames: string[]) {
  const groups = new Map<string, ChartRow[]>();
  for (const row of rows) {
    const key = weekKey(String(row.date));
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  return Array.from(groups.values()).map((group) => {
    const next: ChartRow = { date: String(group[group.length - 1].date) };
    for (const exerciseName of exerciseNames) {
      const key = exerciseKey(exerciseName);
      const total = group.reduce((sum, row) => sum + (asNumber(row[key]) ?? 0), 0);
      next[key] = total > 0 ? round(total, 1) : null;
    }
    return next;
  });
}

function weekKey(value: string) {
  const date = parseDateOnly(value);
  const day = date.getUTCDay() || 7;
  const monday = addUtcDays(date, 1 - day);
  return monday.toISOString().slice(0, 10);
}

function parseDateOnly(value: string) {
  return new Date(`${value}T00:00:00Z`);
}

function addUtcDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86400000);
}

function exerciseKey(exerciseName: string) {
  return `exercise:${exerciseName}`;
}

function exerciseNameFromKey(key: string) {
  return key.replace(/^exercise:/, '');
}

function exerciseColor(exerciseName: string, exerciseNames: string[]) {
  const index = Math.max(0, exerciseNames.indexOf(exerciseName));
  return EXERCISE_COLORS[index % EXERCISE_COLORS.length];
}

function trainingLoadValue(point: { reps: number; volume: number }) {
  return point.volume > 0 ? point.volume : point.reps;
}

function isTooltipValue(key: string, value: number | null): value is number {
  if (value === null || !Number.isFinite(value)) return false;
  if (key.toLowerCase().includes('weight')) return value > 0 && value < 1000;
  if (key.toLowerCase().includes('calories')) return value > 0 && value < 20000;
  return value > 0 && Math.abs(value) < 1_000_000;
}

function labelForTooltipKey(key: string) {
  switch (key) {
    case 'bodyWeightKg':
      return 'Actual weight';
    case 'bodyWeightKgForecast':
      return 'Weight forecast';
    case 'targetWeightKg':
      return 'Target weight';
    case 'caloriesAvg':
      return 'Actual calories';
    case 'caloriesAvgForecast':
      return 'Calories forecast';
    case 'maintenanceCalories':
      return 'Maintenance calories';
    default:
      return key;
  }
}

function colorForTooltipKey(key: string) {
  switch (key) {
    case 'bodyWeightKg':
      return BODY_WEIGHT_COLOR;
    case 'bodyWeightKgForecast':
      return BODY_WEIGHT_FORECAST_COLOR;
    case 'targetWeightKg':
      return TARGET_WEIGHT_COLOR;
    case 'caloriesAvg':
      return CALORIES_COLOR;
    case 'caloriesAvgForecast':
      return CALORIES_FORECAST_COLOR;
    case 'maintenanceCalories':
      return MAINTENANCE_COLOR;
    default:
      return '#a1a1aa';
  }
}

function formatTooltipValue(key: string, value: number) {
  const formatted = key.toLowerCase().includes('calories')
    ? Math.round(value).toLocaleString()
    : round(value, 1).toLocaleString();

  return key.toLowerCase().includes('weight') ? `${formatted} kg` : `${formatted} kcal`;
}

function asNumber(value: string | number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
