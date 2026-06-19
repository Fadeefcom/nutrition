import {
  Check,
  ChevronDown,
  Dumbbell,
  Hash,
  ListChecks,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react';
import type { FocusEvent, ReactNode } from 'react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import { StatusPill } from '../components/StatusPill';
import type { DailyWorkout, ExerciseProgress, Settings, WorkoutSet } from '../types/models';
import { exerciseProgress, normalizeWorkout } from '../utils/calculations';
import { toIsoDate } from '../utils/date';

const emptySet: WorkoutSet = {
  reps: 0,
  addedWeightKg: 0,
  isBodyweight: true,
  rir: null,
  rpe: null,
  notes: '',
};

export default function Workouts() {
  const [date, setDate] = useState(toIsoDate());
  const [settings, setSettings] = useState<Settings | null>(null);
  const [workout, setWorkout] = useState<DailyWorkout | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [nextSettings, nextWorkout] = await Promise.all([api.settings(), api.workout(date)]);
        setSettings(nextSettings);
        setWorkout(normalizeWorkout(nextWorkout));
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load workout.');
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, [date]);

  const normalized = useMemo(() => (workout ? normalizeWorkout(workout) : null), [workout]);

  const progress = useMemo(() => {
    if (!settings || !workout) return [];
    return settings.exerciseTargets
      .filter((target) => target.isActive)
      .map((target) => exerciseProgress(target, workout));
  }, [settings, workout]);

  const progressByExercise = useMemo(() => {
    const rows = new Map<string, ExerciseProgress>();
    for (const item of progress) {
      rows.set(item.exerciseName.toLowerCase(), item);
    }
    return rows;
  }, [progress]);

  const exerciseOptions = useMemo(() => {
    if (!settings || !workout) return [];
    return uniqueNames([
      ...settings.defaultExercises,
      ...settings.exerciseTargets.map((target) => target.exerciseName),
      ...workout.exercises.map((exercise) => exercise.exerciseName),
    ]);
  }, [settings, workout]);

  const save = async () => {
    if (!workout) return;
    setSaving(true);
    setError('');
    try {
      const saved = await api.saveWorkout(date, normalizeWorkout(workout));
      setWorkout(normalizeWorkout(saved));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to save workout.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return <Skeleton className="h-[70vh]" />;
  }

  if (!workout || !settings || !normalized) {
    return <EmptyState title={error || 'Workout unavailable'} />;
  }

  return (
    <div className="space-y-5">
      <section className="panel p-4">
        <div className="grid gap-3 md:grid-cols-[10rem_1fr_auto]">
          <input className="field" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          <input
            className="field"
            value={workout.title}
            onChange={(event) => setWorkout({ ...workout, title: event.target.value })}
            placeholder="Workout title"
          />
          <button className="btn btn-primary" disabled={saving} onClick={save}>
            <Save size={17} />
            {saving ? 'Saving' : 'Save'}
          </button>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
          <InlineSummary icon={<Dumbbell size={15} />} label="Volume" value={`${normalized.totalVolume} kg`} />
          <InlineSummary icon={<Hash size={15} />} label="Reps" value={String(normalized.totalReps)} />
          <InlineSummary icon={<ListChecks size={15} />} label="Exercises" value={String(workout.exercises.length)} />
        </div>
        {error ? <p className="mt-3 text-sm font-semibold text-ember">{error}</p> : null}
      </section>

      <section className="panel p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">Exercises</h2>
        </div>

        {workout.exercises.length === 0 ? (
          <EmptyState title="No workout logged for this day" />
        ) : (
          <div className="divide-y divide-black/10 dark:divide-white/10">
            {workout.exercises.map((exercise, exerciseIndex) => {
              const targetProgress = progressByExercise.get(exercise.exerciseName.toLowerCase());
              return (
                <ExerciseBlock
                  key={exerciseIndex}
                  exerciseName={exercise.exerciseName}
                  exerciseOptions={exerciseOptions}
                  onExerciseNameChange={(exerciseName) => updateExercise(exerciseIndex, { exerciseName })}
                  onRemoveExercise={() => removeExercise(exerciseIndex)}
                  targetProgress={targetProgress}
                >
                  <SetGridHeader />
                  <div className="space-y-2">
                    {exercise.sets.map((set, setIndex) => (
                      <SetRow
                        key={setIndex}
                        set={set}
                        setIndex={setIndex}
                        onChange={(patch) => updateSet(exerciseIndex, setIndex, patch)}
                        onRemove={() => removeSet(exerciseIndex, setIndex)}
                      />
                    ))}
                  </div>
                  <button className="btn btn-ghost mt-3 h-9" onClick={() => addSet(exerciseIndex)}>
                    <Plus size={15} />
                    Add Set
                  </button>
                </ExerciseBlock>
              );
            })}
          </div>
        )}

        <button className="btn btn-ghost mt-4 w-full" onClick={addExercise}>
          <Plus size={17} />
          Add Exercise
        </button>
      </section>
    </div>
  );

  function addExercise() {
    setWorkout((current) =>
      current
        ? {
            ...current,
            exercises: [...current.exercises, { exerciseName: '', sets: [{ ...emptySet }], notes: '' }],
          }
        : current,
    );
  }

  function updateExercise(index: number, patch: Partial<DailyWorkout['exercises'][number]>) {
    setWorkout((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((exercise, currentIndex) =>
              currentIndex === index ? { ...exercise, ...patch } : exercise,
            ),
          }
        : current,
    );
  }

  function removeExercise(index: number) {
    setWorkout((current) =>
      current
        ? { ...current, exercises: current.exercises.filter((_, currentIndex) => currentIndex !== index) }
        : current,
    );
  }

  function addSet(exerciseIndex: number) {
    setWorkout((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((exercise, currentIndex) =>
              currentIndex === exerciseIndex
                ? { ...exercise, sets: [...exercise.sets, { ...emptySet }] }
                : exercise,
            ),
          }
        : current,
    );
  }

  function updateSet(exerciseIndex: number, setIndex: number, patch: Partial<WorkoutSet>) {
    setWorkout((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((exercise, currentExercise) =>
              currentExercise === exerciseIndex
                ? {
                    ...exercise,
                    sets: exercise.sets.map((set, currentSet) =>
                      currentSet === setIndex ? { ...set, ...patch } : set,
                    ),
                  }
                : exercise,
            ),
          }
        : current,
    );
  }

  function removeSet(exerciseIndex: number, setIndex: number) {
    setWorkout((current) =>
      current
        ? {
            ...current,
            exercises: current.exercises.map((exercise, currentExercise) =>
              currentExercise === exerciseIndex
                ? { ...exercise, sets: exercise.sets.filter((_, currentSet) => currentSet !== setIndex) }
                : exercise,
            ),
          }
        : current,
    );
  }
}

function ExerciseBlock({
  exerciseName,
  exerciseOptions,
  onExerciseNameChange,
  onRemoveExercise,
  targetProgress,
  children,
}: {
  exerciseName: string;
  exerciseOptions: string[];
  onExerciseNameChange: (exerciseName: string) => void;
  onRemoveExercise: () => void;
  targetProgress?: ExerciseProgress;
  children: ReactNode;
}) {
  return (
    <div className="py-4 first:pt-0 last:pb-0">
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <ExerciseCombobox
            value={exerciseName}
            options={exerciseOptions}
            onChange={onExerciseNameChange}
            placeholder="Select exercise"
          />
          {targetProgress ? <TargetProgressLine progress={targetProgress} /> : null}
        </div>
        <button className="btn btn-danger h-10 w-10 shrink-0 px-0" onClick={onRemoveExercise} title="Delete exercise">
          <Trash2 size={16} />
        </button>
      </div>

      <div className="mt-3">{children}</div>
    </div>
  );
}

function SetGridHeader() {
  return (
    <div className="mb-2 hidden grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_2.75rem] gap-2 text-xs font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400 sm:grid">
      <span>Set</span>
      <span>Reps</span>
      <span>Weight</span>
      <span>Reps In Reserve</span>
      <span>Difficulty</span>
      <span className="text-right">Actions</span>
    </div>
  );
}

function SetRow({
  set,
  setIndex,
  onChange,
  onRemove,
}: {
  set: WorkoutSet;
  setIndex: number;
  onChange: (patch: Partial<WorkoutSet>) => void;
  onRemove: () => void;
}) {
  return (
    <div className="grid grid-cols-[2rem_minmax(0,1fr)_minmax(0,1fr)_2.5rem] items-center gap-2 sm:grid-cols-[2.5rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,0.8fr)_minmax(0,0.8fr)_2.75rem]">
      <span className="text-sm font-black text-zinc-500 dark:text-zinc-400">{setIndex + 1}</span>
      <SetMetricInput
        label={`Set ${setIndex + 1} reps`}
        suffix="reps"
        value={set.reps}
        onChange={(reps) => onChange({ reps: reps ?? 0 })}
      />
      <SetMetricInput
        label={`Set ${setIndex + 1} weight`}
        suffix="kg"
        step="0.5"
        value={set.addedWeightKg}
        onChange={(addedWeightKg) => onChange({ addedWeightKg: addedWeightKg ?? 0 })}
      />
      <button className="btn btn-ghost h-10 w-10 px-0 sm:order-last" onClick={onRemove} title="Delete set">
        <Trash2 size={15} />
      </button>
      <SetMetricInput
        className="col-start-2 sm:col-start-auto"
        label={`Set ${setIndex + 1} RIR`}
        suffix="RIR"
        step="0.5"
        value={set.rir}
        nullable
        onChange={(rir) => onChange({ rir })}
      />
      <SetMetricInput
        label={`Set ${setIndex + 1} RPE`}
        suffix="RPE"
        step="0.5"
        value={set.rpe}
        nullable
        onChange={(rpe) => onChange({ rpe })}
      />
    </div>
  );
}

function SetMetricInput({
  label,
  value,
  onChange,
  suffix,
  step = '1',
  nullable = false,
  className = '',
}: {
  label: string;
  value: number | null | undefined;
  onChange: (value: number | null) => void;
  suffix: string;
  step?: string;
  nullable?: boolean;
  className?: string;
}) {
  return (
    <label className={`relative min-w-0 ${className}`}>
      <span className="sr-only">{label}</span>
      <input
        className="field h-10 min-h-10 w-full px-2 pr-12 text-right"
        type="number"
        min="0"
        step={step}
        value={value ?? ''}
        placeholder="0"
        onChange={(event) => {
          const next = event.target.value;
          onChange(next === '' ? (nullable ? null : 0) : Number(next));
        }}
      />
      <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[0.65rem] font-black uppercase text-zinc-400">
        {suffix}
      </span>
    </label>
  );
}

function ExerciseCombobox({
  value,
  options,
  onChange,
  placeholder,
}: {
  value: string;
  options: string[];
  onChange: (value: string) => void;
  placeholder: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOptions = normalizedQuery
    ? options.filter((option) => option.toLowerCase().includes(normalizedQuery))
    : options;
  const hasExactMatch = options.some((option) => option.toLowerCase() === normalizedQuery);
  const createName = query.trim();
  const canCreateNamed = Boolean(createName && !hasExactMatch);

  const closeIfFocusLeaves = (event: FocusEvent<HTMLDivElement>) => {
    const nextTarget = event.relatedTarget;
    if (nextTarget instanceof Node && event.currentTarget.contains(nextTarget)) {
      return;
    }
    setOpen(false);
    setQuery('');
  };

  const commit = (exerciseName: string) => {
    onChange(exerciseName);
    setOpen(false);
    setQuery('');
  };

  return (
    <div className="relative" onBlur={closeIfFocusLeaves}>
      <button
        className="field flex w-full items-center justify-between gap-2 text-left"
        onClick={() => {
          setOpen((current) => !current);
          setQuery('');
        }}
        type="button"
      >
        <span className={value ? 'truncate font-bold' : 'truncate text-zinc-400'}>
          {value || placeholder}
        </span>
        <ChevronDown size={16} className="shrink-0 text-zinc-500 dark:text-zinc-400" />
      </button>

      {open ? (
        <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-30 max-h-72 overflow-hidden rounded-lg border border-black/10 bg-white shadow-2xl dark:border-white/10 dark:bg-[#191b1f]">
          <label className="relative block border-b border-black/10 p-2 dark:border-white/10">
            <Search
              size={15}
              className="pointer-events-none absolute left-5 top-1/2 -translate-y-1/2 text-zinc-400"
            />
            <input
              autoFocus
              className="field h-9 min-h-9 w-full pl-9"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search exercises"
            />
          </label>

          <div className="max-h-44 overflow-y-auto py-1">
            {filteredOptions.length > 0 ? (
              filteredOptions.map((option) => (
                <button
                  key={option}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm font-semibold transition hover:bg-black/5 dark:hover:bg-white/10"
                  onClick={() => commit(option)}
                  type="button"
                >
                  <span className="truncate">{option}</span>
                  {option === value ? <Check size={15} className="shrink-0 text-mint" /> : null}
                </button>
              ))
            ) : (
              <p className="px-3 py-3 text-sm text-zinc-500 dark:text-zinc-400">No matches</p>
            )}
          </div>

          <div className="sticky bottom-0 border-t border-black/10 bg-white p-2 dark:border-white/10 dark:bg-[#191b1f]">
            <button
              className="btn btn-ghost h-9 w-full justify-start"
              disabled={Boolean(createName && hasExactMatch)}
              onClick={() => commit(canCreateNamed ? createName : 'New Exercise')}
              type="button"
            >
              <Plus size={15} />
              {canCreateNamed
                ? `Create "${createName}"`
                : createName && hasExactMatch
                  ? 'Exercise already exists'
                  : 'Create new exercise'}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TargetProgressLine({ progress }: { progress: ExerciseProgress }) {
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
      <span className="font-bold text-zinc-700 dark:text-zinc-200">
        Target: {progress.completedReps} / {progress.targetReps} reps
      </span>
      <div className="h-1.5 w-28 rounded-full bg-black/10 dark:bg-white/10">
        <div
          className="h-full rounded-full bg-mint"
          style={{ width: `${Math.min(100, progress.completionPercent)}%` }}
        />
      </div>
      {progress.targetReached ? <StatusPill state="green" label="Reached" /> : null}
    </div>
  );
}

function InlineSummary({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <span className="inline-flex min-h-8 items-center gap-1.5 rounded-lg bg-black/5 px-2.5 font-bold text-zinc-700 dark:bg-white/10 dark:text-zinc-200">
      <span className="text-zinc-500 dark:text-zinc-400">{icon}</span>
      <span className="text-zinc-500 dark:text-zinc-400">{label}:</span>
      <span className="text-zinc-950 dark:text-white">{value}</span>
    </span>
  );
}

function uniqueNames(names: string[]) {
  return [...new Set(names.map((name) => name.trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b),
  );
}
