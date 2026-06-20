import { Info, Plus, Trash2, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api } from '../api/client';
import { BaseDropdown, type DropdownOption } from '../components/BaseDropdown';
import { EmptyState } from '../components/EmptyState';
import { Skeleton } from '../components/Skeleton';
import type {
  BodyMetric,
  ExerciseTarget,
  NutritionTarget,
  Profile,
  Settings as SettingsModel,
} from '../types/models';
import {
  calculateBmi,
  calculateFiberTargetGrams,
  calculateMaintenanceCalories,
  macroTargets,
} from '../utils/calculations';
import { formatShortDate, toIsoDate } from '../utils/date';

type SaveStatus = 'idle' | 'saving' | 'saved' | 'invalid' | 'error';

export default function Settings() {
  const today = toIsoDate();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [settings, setSettings] = useState<SettingsModel | null>(null);
  const [bodyMetric, setBodyMetric] = useState<BodyMetric | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [calorieAdjustmentInput, setCalorieAdjustmentInput] = useState('');
  const [password, setPassword] = useState(() => localStorage.getItem('diary-password') ?? '');
  const [loading, setLoading] = useState(true);
  const [profileStatus, setProfileStatus] = useState<SaveStatus>('idle');
  const [settingsStatus, setSettingsStatus] = useState<SaveStatus>('idle');
  const [weightStatus, setWeightStatus] = useState<SaveStatus>('idle');
  const [error, setError] = useState('');
  const [mobileEditingTargetId, setMobileEditingTargetId] = useState<string | null>(null);
  const [openRuleTargetId, setOpenRuleTargetId] = useState<string | null>(null);

  const profileSnapshotRef = useRef('');
  const settingsSnapshotRef = useRef('');
  const weightSnapshotRef = useRef('');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const [nextProfile, nextSettings, nextMetric] = await Promise.all([
          api.profile(),
          api.settings(),
          api.bodyMetric(today),
        ]);

        setProfile(nextProfile);
        setSettings(nextSettings);
        setBodyMetric(nextMetric);
        setWeightInput(nextMetric.weightKg ? String(nextMetric.weightKg) : '');
        setCalorieAdjustmentInput(
          String(
            getCalorieAdjustment(
              nextSettings.nutritionTarget,
              calculateMaintenanceCalories({
                weightKg: nextMetric.weightKg,
                heightCm: nextProfile.heightCm,
                age: nextProfile.age,
                sex: nextProfile.sex,
                activityMultiplier: nextProfile.activityMultiplier,
              }),
            ),
          ),
        );

        profileSnapshotRef.current = JSON.stringify(nextProfile);
        settingsSnapshotRef.current = JSON.stringify(nextSettings);
        weightSnapshotRef.current = nextMetric.weightKg ? String(nextMetric.weightKg) : '';
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Unable to load settings.');
      } finally {
        setLoading(false);
      }
    };

    void load();
  }, [today]);

  const macroTotal = useMemo(() => {
    if (!settings) return 0;
    const target = settings.nutritionTarget;
    return target.proteinPercent + target.carbsPercent + target.fatPercent;
  }, [settings]);

  const grams = useMemo(
    () => (settings ? macroTargets(settings.nutritionTarget) : null),
    [settings],
  );

  const currentWeight = useMemo(() => {
    const parsed = Number(weightInput);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : bodyMetric?.weightKg ?? null;
  }, [bodyMetric?.weightKg, weightInput]);

  const bmi = useMemo(
    () => calculateBmi(currentWeight, profile?.heightCm),
    [currentWeight, profile?.heightCm],
  );

  const maintenanceCalories = useMemo(
    () =>
      calculateMaintenanceCalories({
        weightKg: currentWeight,
        heightCm: profile?.heightCm,
        age: profile?.age,
        sex: profile?.sex,
        activityMultiplier: profile?.activityMultiplier,
      }),
    [currentWeight, profile?.activityMultiplier, profile?.age, profile?.heightCm, profile?.sex],
  );

  useEffect(() => {
    if (!settings || loading || !maintenanceCalories) return;

    setSettings((current) => {
      if (!current) return current;

      const calorieAdjustment = getCalorieAdjustment(current.nutritionTarget, maintenanceCalories);
      const nutritionTarget = buildEnergyTarget(
        current.nutritionTarget,
        maintenanceCalories,
        calorieAdjustment,
      );

      if (
        nutritionTarget.targetCalories === current.nutritionTarget.targetCalories &&
        nutritionTarget.fiberTargetGrams === current.nutritionTarget.fiberTargetGrams &&
        nutritionTarget.calorieAdjustment === current.nutritionTarget.calorieAdjustment
      ) {
        return current;
      }

      return { ...current, nutritionTarget };
    });
  }, [loading, maintenanceCalories, settings]);

  useEffect(() => {
    if (!profile || loading) return;

    const snapshot = JSON.stringify(profile);
    if (snapshot === profileSnapshotRef.current) {
      setProfileStatus('idle');
      return;
    }

    setProfileStatus('saving');
    setError('');

    const timeoutId = window.setTimeout(async () => {
      try {
        await api.saveProfile(profile);
        profileSnapshotRef.current = snapshot;
        setProfileStatus('saved');
      } catch (err) {
        setProfileStatus('error');
        setError(err instanceof Error ? err.message : 'Unable to auto-save profile.');
      }
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [profile, loading]);

  useEffect(() => {
    if (!settings || loading) return;

    const snapshot = JSON.stringify(settings);
    if (snapshot === settingsSnapshotRef.current) {
      setSettingsStatus('idle');
      return;
    }

    if (macroTotal !== 100) {
      setSettingsStatus('invalid');
      return;
    }

    setSettingsStatus('saving');
    setError('');

    const timeoutId = window.setTimeout(async () => {
      try {
        await api.saveSettings(settings);
        settingsSnapshotRef.current = snapshot;
        setSettingsStatus('saved');
      } catch (err) {
        setSettingsStatus('error');
        setError(err instanceof Error ? err.message : 'Unable to auto-save settings.');
      }
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [settings, loading, macroTotal]);

  useEffect(() => {
    if (!bodyMetric || loading) return;
    if (weightInput === weightSnapshotRef.current) {
      setWeightStatus('idle');
      return;
    }

    const weightKg = Number(weightInput);
    if (!Number.isFinite(weightKg) || weightKg <= 0) {
      setWeightStatus(weightInput.trim() ? 'invalid' : 'idle');
      return;
    }

    setWeightStatus('saving');
    setError('');
    const pendingWeightInput = weightInput;

    const timeoutId = window.setTimeout(async () => {
      try {
        const savedMetric = await api.saveBodyMetric(today, {
          ...bodyMetric,
          date: today,
          weightKg,
        });
        weightSnapshotRef.current = savedMetric.weightKg ? String(savedMetric.weightKg) : '';
        setBodyMetric(savedMetric);
        setWeightInput((current) =>
          current === pendingWeightInput ? weightSnapshotRef.current : current,
        );
        setWeightStatus('saved');
      } catch (err) {
        setWeightStatus('error');
        setError(err instanceof Error ? err.message : 'Unable to auto-save current weight.');
      }
    }, 700);

    return () => window.clearTimeout(timeoutId);
  }, [bodyMetric, loading, today, weightInput]);

  if (loading) {
    return <Skeleton className="h-[70vh]" />;
  }

  if (!profile || !settings) {
    return <EmptyState title={error || 'Settings unavailable'} />;
  }

  const mobileEditingIndex = settings.exerciseTargets.findIndex(
    (target) => target.id === mobileEditingTargetId,
  );
  const mobileEditingTarget =
    mobileEditingIndex >= 0 ? settings.exerciseTargets[mobileEditingIndex] : null;

  return (
    <div className="space-y-5">
      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-black">Settings</h1>
          <AutosaveStatus status={profileStatus} idleLabel="Auto-save enabled" />
        </div>
        {error ? <p className="mb-3 text-sm font-semibold text-ember">{error}</p> : null}

        <div className="grid gap-4 xl:grid-cols-2">
          <SettingsGroup title="Personal metrics">
            <TextField
              label="Name"
              value={profile.name}
              onChange={(name) => setProfile({ ...profile, name })}
            />
            <NumberField
              label="Age"
              value={profile.age ?? 30}
              onChange={(age) => setProfile({ ...profile, age })}
            />
            <NumberField
              label="Height cm"
              value={profile.heightCm ?? ''}
              onChange={(heightCm) => setProfile({ ...profile, heightCm })}
            />
            <DropdownField
              label="Sex"
              value={profile.sex ?? 'male'}
              onChange={(sex) => setProfile({ ...profile, sex })}
              options={[
                { value: 'male', label: 'Male' },
                { value: 'female', label: 'Female' },
              ]}
            />
            <DropdownField
              label="Activity"
              value={String(profile.activityMultiplier ?? 1.55)}
              onChange={(activityMultiplier) =>
                setProfile({ ...profile, activityMultiplier: Number(activityMultiplier) })
              }
              options={[
                { value: '1.2', label: 'Sedentary - 1.2' },
                { value: '1.375', label: 'Light - 1.375' },
                { value: '1.55', label: 'Moderate - 1.55' },
                { value: '1.725', label: 'High - 1.725' },
                { value: '1.9', label: 'Very high - 1.9' },
              ]}
            />
          </SettingsGroup>

          <SettingsGroup title="System">
            <TextField
              label="Time zone"
              value={profile.timeZone}
              onChange={(timeZone) => setProfile({ ...profile, timeZone })}
            />
            <TextField
              label="API password"
              type="password"
              value={password}
              onChange={(nextPassword) => {
                setPassword(nextPassword);
                localStorage.setItem('diary-password', nextPassword);
              }}
              helper="Stored locally in this browser."
            />
          </SettingsGroup>
        </div>
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-black">Current Weight</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400">{formatShortDate(today)}</p>
          </div>
          <AutosaveStatus status={weightStatus} idleLabel="Auto-saves after edit" />
        </div>
        <div className="flex flex-wrap items-end gap-4">
          <label className="w-full max-w-48 text-sm font-bold">
            <span className="mb-1 block text-zinc-500 dark:text-zinc-400">Weight kg</span>
            <input
              className="field no-spinner w-full"
              type="number"
              min="1"
              step="0.1"
              value={weightInput}
              onChange={(event) => setWeightInput(event.target.value)}
            />
          </label>
          <label className="w-full max-w-48 text-sm font-bold">
            <span className="mb-1 block text-zinc-500 dark:text-zinc-400">Target weight kg</span>
            <input
              className="field no-spinner w-full"
              type="number"
              min="1"
              step="0.1"
              value={profile.targetWeightKg ?? ''}
              onChange={(event) =>
                setProfile({
                  ...profile,
                  targetWeightKg: event.target.value === '' ? null : Number(event.target.value),
                })
              }
            />
          </label>
          <InlineMetric label="BMI" value={bmi ? String(bmi) : 'Need data'} />
          <InlineMetric
            label="Weight / height"
            value={
              currentWeight && profile.heightCm
                ? `${currentWeight} kg / ${profile.heightCm} cm`
                : 'Need data'
            }
          />
          <InlineMetric
            label="Maintenance"
            value={maintenanceCalories ? `${maintenanceCalories} kcal` : 'Need data'}
          />
        </div>
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">Nutrition Targets</h2>
          <div className="flex items-center gap-3">
            <p className={`text-sm font-bold ${macroTotal === 100 ? 'text-mint' : 'text-ember'}`}>
              Total: {macroTotal}%
            </p>
            <AutosaveStatus status={settingsStatus} idleLabel="Auto-save enabled" />
          </div>
        </div>
        <div className="grid gap-3 xl:grid-cols-[minmax(17rem,1fr)_minmax(22rem,1.35fr)_minmax(18rem,1fr)]">
          <section className="rounded-lg bg-black/5 p-3 dark:bg-white/10">
            <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Energy Balance
            </h3>
            <div className="mb-3 rounded-lg border border-mint/20 bg-mint/10 p-3 dark:border-mint/20 dark:bg-mint/10">
              <span className="block text-xs font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
                Daily Target
              </span>
              <span className="mt-1 block text-3xl font-black tabular-nums text-zinc-950 dark:text-white">
                {settings.nutritionTarget.targetCalories} kcal
              </span>
            </div>
            <div className="mb-3 grid grid-cols-2 gap-2">
              <EnergyMetric
                label="Maintenance"
                value={maintenanceCalories ? `${maintenanceCalories} kcal` : 'Need data'}
              />
              <EnergyMetric
                label="Adjustment"
                value={formatSignedCalories(getCalorieAdjustment(settings.nutritionTarget, maintenanceCalories))}
              />
            </div>
            <CalorieAdjustmentField
              value={calorieAdjustmentInput}
              disabled={!maintenanceCalories}
              onChange={updateCalorieAdjustment}
            />
          </section>

          <section className="rounded-lg bg-black/5 p-3 dark:bg-white/10">
            <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Macro Split
            </h3>
            <div className="grid gap-3 md:grid-cols-3">
              <MacroPercentField
                label="Protein"
                value={settings.nutritionTarget.proteinPercent}
                grams={grams?.proteinGrams ?? 0}
                onChange={(proteinPercent) =>
                  setSettings({ ...settings, nutritionTarget: { ...settings.nutritionTarget, proteinPercent } })
                }
              />
              <MacroPercentField
                label="Carbs"
                value={settings.nutritionTarget.carbsPercent}
                grams={grams?.carbsGrams ?? 0}
                onChange={(carbsPercent) =>
                  setSettings({ ...settings, nutritionTarget: { ...settings.nutritionTarget, carbsPercent } })
                }
              />
              <MacroPercentField
                label="Fat"
                value={settings.nutritionTarget.fatPercent}
                grams={grams?.fatGrams ?? 0}
                onChange={(fatPercent) =>
                  setSettings({ ...settings, nutritionTarget: { ...settings.nutritionTarget, fatPercent } })
                }
              />
            </div>
          </section>

          <section className="rounded-lg bg-black/5 p-3 dark:bg-white/10">
            <h3 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
              Dynamic Metrics
            </h3>
            <div className="grid gap-2">
              <DynamicMetric
                label="Calculated Fiber"
                value={`${calculateFiberTargetGrams(settings.nutritionTarget.targetCalories)} g`}
                helper="*14 g per 1000 kcal"
                muted
              />
              <DynamicMetric label="Calculated Protein" value={`${grams?.proteinGrams ?? 0} g`} />
              <DynamicMetric label="Calculated Carbs" value={`${grams?.carbsGrams ?? 0} g`} />
              <DynamicMetric label="Calculated Fat" value={`${grams?.fatGrams ?? 0} g`} />
            </div>
          </section>
        </div>
      </section>

      <section className="panel p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">Exercise Targets</h2>
          <button className="btn btn-ghost" onClick={addTarget}>
            <Plus size={17} />
            Target
          </button>
        </div>

        <div className="space-y-2 md:hidden">
          {settings.exerciseTargets.map((target) => (
            <div key={target.id} className="grid grid-cols-[minmax(0,1fr)_2.75rem] gap-2">
              <button
                className="flex min-h-12 min-w-0 items-center justify-between gap-2 rounded-lg border border-black/10 bg-white px-3 py-2 text-left text-sm transition dark:border-white/10 dark:bg-[#191b1f]"
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    setMobileEditingTargetId(target.id);
                  }
                }}
                onClick={() => setMobileEditingTargetId(target.id)}
                aria-label={`Edit ${target.exerciseName}`}
                type="button"
              >
                <span className="min-w-0 flex-1 truncate font-bold">{target.exerciseName}</span>
                <span className="shrink-0 text-[0.7rem] font-black text-zinc-500 dark:text-zinc-400">
                  • {target.targetSets}x{target.targetRepsPerSet} • {formatTargetNumber(target.targetAddedWeightKg)}kg
                </span>
              </button>
              <button
                className="btn btn-danger h-12 w-11 px-0"
                aria-label={`Delete ${target.exerciseName}`}
                onClick={() => removeTarget(target.id)}
                title="Delete target"
                type="button"
              >
                <Trash2 size={15} />
              </button>
            </div>
          ))}
        </div>

        <div className="hidden md:block">
          <div className="grid grid-cols-[minmax(12rem,1fr)_minmax(18rem,auto)_2.5rem_2.5rem] gap-3 border-b border-black/10 pb-2 text-xs font-black uppercase tracking-wide text-zinc-500 dark:border-white/10 dark:text-zinc-400">
            <span>Exercise</span>
            <span className="text-center">Target</span>
            <span className="text-center">Rule</span>
            <span className="sr-only">Actions</span>
          </div>

          <div className="divide-y divide-black/10 dark:divide-white/10">
            {settings.exerciseTargets.map((target, index) => (
              <div key={target.id} className="group">
                <div className="grid grid-cols-[minmax(12rem,1fr)_minmax(18rem,auto)_2.5rem_2.5rem] items-center gap-3 py-2">
                  <EditableTextValue
                    className="min-w-0"
                    value={target.exerciseName}
                    onChange={(exerciseName) => updateTarget(index, { exerciseName })}
                  />

                  <div className="flex min-w-0 items-center justify-center gap-1 text-sm">
                    <span className="pr-1 font-black text-zinc-400">—</span>
                    <EditableNumberValue
                      value={target.targetSets}
                      suffix="sets"
                      onChange={(targetSets) =>
                        updateTarget(index, {
                          targetSets,
                          targetTotalReps: targetSets * target.targetRepsPerSet,
                        })
                      }
                    />
                    <span className="px-0.5 font-black text-zinc-400">x</span>
                    <EditableNumberValue
                      value={target.targetRepsPerSet}
                      suffix="reps"
                      onChange={(targetRepsPerSet) =>
                        updateTarget(index, {
                          targetRepsPerSet,
                          targetTotalReps: target.targetSets * targetRepsPerSet,
                        })
                      }
                    />
                    <span className="px-0.5 font-black text-zinc-400">@</span>
                    <EditableNumberValue
                      value={target.targetAddedWeightKg}
                      suffix="kg"
                      step="0.5"
                      onChange={(targetAddedWeightKg) => updateTarget(index, { targetAddedWeightKg })}
                    />
                  </div>

                  <button
                    className="btn btn-ghost h-8 w-8 px-0"
                    onClick={() =>
                      setOpenRuleTargetId((current) => (current === target.id ? null : target.id))
                    }
                    title={target.progressionRule}
                    type="button"
                  >
                    <Info size={15} />
                  </button>

                  <button
                    className="btn btn-danger h-8 w-8 px-0 opacity-0 transition focus:opacity-100 group-hover:opacity-100"
                    onClick={() => removeTarget(target.id)}
                    title="Delete target"
                    type="button"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                {openRuleTargetId === target.id ? (
                  <div className="grid grid-cols-[minmax(12rem,1fr)_minmax(18rem,auto)_2.5rem_2.5rem] gap-3 pb-3">
                    <span />
                    <EditableTextValue
                      className="col-span-2"
                      value={target.progressionRule}
                      onChange={(progressionRule) => updateTarget(index, { progressionRule })}
                      prefix="Rule:"
                    />
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>

        {mobileEditingTarget ? (
          <div className="fixed inset-0 z-50 md:hidden">
            <button
              className="absolute inset-0 bg-black/45"
              onClick={() => setMobileEditingTargetId(null)}
              aria-label="Close target editor"
              type="button"
            />
            <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-2xl border border-black/10 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-[#191b1f]">
              <div className="mb-4 flex items-center justify-between gap-3">
                <h3 className="text-lg font-black">Exercise Target</h3>
                <button
                  className="btn btn-ghost h-9 w-9 px-0"
                  onClick={() => setMobileEditingTargetId(null)}
                  title="Close"
                  type="button"
                >
                  <X size={16} />
                </button>
              </div>

              <div className="space-y-3">
                <TextField
                  label="Exercise"
                  value={mobileEditingTarget.exerciseName}
                  onChange={(exerciseName) => updateTargetById(mobileEditingTarget.id, { exerciseName })}
                />
                <div className="grid grid-cols-3 gap-2">
                  <NumberField
                    label="Sets"
                    value={mobileEditingTarget.targetSets}
                    onChange={(targetSets) =>
                      updateTargetById(mobileEditingTarget.id, {
                        targetSets,
                        targetTotalReps: targetSets * mobileEditingTarget.targetRepsPerSet,
                      })
                    }
                  />
                  <NumberField
                    label="Reps"
                    value={mobileEditingTarget.targetRepsPerSet}
                    onChange={(targetRepsPerSet) =>
                      updateTargetById(mobileEditingTarget.id, {
                        targetRepsPerSet,
                        targetTotalReps: mobileEditingTarget.targetSets * targetRepsPerSet,
                      })
                    }
                  />
                  <NumberField
                    label="Weight"
                    step="0.5"
                    value={mobileEditingTarget.targetAddedWeightKg}
                    onChange={(targetAddedWeightKg) =>
                      updateTargetById(mobileEditingTarget.id, { targetAddedWeightKg })
                    }
                  />
                </div>
                <TextField
                  label="Progression"
                  value={mobileEditingTarget.progressionRule}
                  onChange={(progressionRule) =>
                    updateTargetById(mobileEditingTarget.id, { progressionRule })
                  }
                />
              </div>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );

  function updateTarget(index: number, patch: Partial<ExerciseTarget>) {
    setSettings((current) =>
      current
        ? {
            ...current,
            exerciseTargets: current.exerciseTargets.map((target, currentIndex) =>
              currentIndex === index ? { ...target, ...patch } : target,
            ),
          }
        : current,
    );
  }

  function updateTargetById(id: string, patch: Partial<ExerciseTarget>) {
    setSettings((current) =>
      current
        ? {
            ...current,
            exerciseTargets: current.exerciseTargets.map((target) =>
              target.id === id ? { ...target, ...patch } : target,
            ),
          }
        : current,
    );
  }

  function updateCalorieAdjustment(rawValue: string) {
    setCalorieAdjustmentInput(rawValue);

    if (rawValue.trim() === '' || rawValue.trim() === '+' || rawValue.trim() === '-') {
      return;
    }

    const calorieAdjustment = Number(rawValue);
    if (!Number.isFinite(calorieAdjustment)) {
      return;
    }

    setSettings((current) =>
      current
        ? {
            ...current,
            nutritionTarget: buildEnergyTarget(
              current.nutritionTarget,
              maintenanceCalories,
              calorieAdjustment,
            ),
          }
        : current,
    );
  }

  function addTarget() {
    setSettings((current) =>
      current
        ? {
            ...current,
            exerciseTargets: [
              ...current.exerciseTargets,
              {
                id: crypto.randomUUID(),
                exerciseName: 'New Exercise',
                targetSets: 4,
                targetRepsPerSet: 10,
                targetTotalReps: 40,
                targetAddedWeightKg: 0,
                targetType: 'reps',
                progressionRule: 'Add weight next time when every target set is completed.',
                isActive: true,
              },
            ],
          }
        : current,
    );
  }

  function removeTarget(id: string) {
    setMobileEditingTargetId((current) => (current === id ? null : current));
    setOpenRuleTargetId((current) => (current === id ? null : current));
    setSettings((current) =>
      current
        ? {
            ...current,
            exerciseTargets: current.exerciseTargets.filter((target) => target.id !== id),
          }
        : current,
    );
  }
}

function getCalorieAdjustment(target: NutritionTarget, maintenanceCalories: number | null) {
  if (Number.isFinite(target.calorieAdjustment)) {
    return target.calorieAdjustment;
  }

  return maintenanceCalories ? target.targetCalories - maintenanceCalories : 0;
}

function buildEnergyTarget(
  target: NutritionTarget,
  maintenanceCalories: number | null,
  calorieAdjustment: number,
): NutritionTarget {
  const safeAdjustment = Math.round(calorieAdjustment);
  const targetCalories = maintenanceCalories
    ? Math.max(0, Math.round(maintenanceCalories + safeAdjustment))
    : target.targetCalories;

  return {
    ...target,
    calorieAdjustment: safeAdjustment,
    targetCalories,
    fiberTargetGrams: calculateFiberTargetGrams(targetCalories),
  };
}

function formatSignedCalories(value: number) {
  const rounded = Math.round(value);
  return `${rounded > 0 ? '+' : ''}${rounded} kcal`;
}

function SettingsGroup({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg bg-black/5 p-3 dark:bg-white/10">
      <h2 className="mb-3 text-sm font-black uppercase tracking-wide text-zinc-500 dark:text-zinc-400">
        {title}
      </h2>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(12rem,1fr))]">
        {children}
      </div>
    </section>
  );
}

function TextField({
  label,
  value,
  onChange,
  type = 'text',
  helper,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  helper?: string;
}) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        className="field w-full"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
      {helper ? <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">{helper}</span> : null}
    </label>
  );
}

function NumberField({
  label,
  value,
  onChange,
  helper,
  step,
}: {
  label: string;
  value: number | '';
  onChange: (value: number) => void;
  helper?: string;
  step?: string;
}) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">{label}</span>
      <input
        className="field w-full"
        type="number"
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value === '' ? 0 : Number(event.target.value))}
      />
      {helper ? <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">{helper}</span> : null}
    </label>
  );
}

function EnergyMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-h-16 rounded-lg bg-white/55 px-3 py-2 dark:bg-black/15">
      <span className="block text-xs font-bold text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="mt-1 block text-sm font-black tabular-nums text-zinc-950 dark:text-white">
        {value}
      </span>
    </div>
  );
}

function CalorieAdjustmentField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">Calorie Adjustment</span>
      <div className="relative">
        <input
          className="field w-full pr-16 disabled:opacity-60"
          disabled={disabled}
          inputMode="numeric"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="+300"
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
          kcal
        </span>
      </div>
      <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
        +300 kcal for lean mass gain.
      </span>
    </label>
  );
}

function MacroPercentField({
  label,
  value,
  grams,
  onChange,
}: {
  label: string;
  value: number;
  grams: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">{label}</span>
      <div className="relative">
        <input
          className="field w-full pr-20"
          type="number"
          value={value}
          onChange={(event) => onChange(Number(event.target.value))}
        />
        <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-zinc-400">
          %
        </span>
      </div>
      <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
        {grams} g target
      </span>
    </label>
  );
}

function DynamicMetric({
  label,
  value,
  helper,
  muted = false,
}: {
  label: string;
  value: string;
  helper?: string;
  muted?: boolean;
}) {
  return (
    <div
      className={`rounded-lg border px-3 py-2 ${
        muted
          ? 'border-black/10 bg-zinc-950/[0.035] dark:border-white/10 dark:bg-zinc-950/25'
          : 'border-transparent bg-white/55 dark:bg-black/15'
      }`}
    >
      <div className="flex min-h-6 items-center justify-between gap-3">
        <span className="text-sm font-bold text-zinc-500 dark:text-zinc-400">{label}</span>
        <span className="text-sm font-black tabular-nums text-zinc-950 dark:text-white">{value}</span>
      </div>
      {helper ? (
        <span className="mt-1 block text-xs font-normal text-zinc-500 dark:text-zinc-400">
          {helper}
        </span>
      ) : null}
    </div>
  );
}

function DropdownField({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Array<DropdownOption<string>>;
}) {
  return (
    <label className="text-sm font-bold">
      <span className="mb-1 block text-zinc-500 dark:text-zinc-400">{label}</span>
      <BaseDropdown options={options} value={value} onChange={(nextValue) => onChange(nextValue)} />
    </label>
  );
}

function InlineMetric({ label, value }: { label: string; value: string }) {
  return (
    <span className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-black/5 px-3 text-sm dark:bg-white/10">
      <span className="text-zinc-500 dark:text-zinc-400">{label}</span>
      <span className="font-black text-zinc-950 dark:text-white">{value}</span>
    </span>
  );
}

function EditableTextValue({
  value,
  onChange,
  prefix,
  className = '',
}: {
  value: string;
  onChange: (value: string) => void;
  prefix?: string;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const skipCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraft(value);
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        autoFocus
        className={`field h-9 min-h-9 w-full px-2 py-1 font-bold ${className}`}
        value={draft}
        onBlur={() => {
          if (skipCommitRef.current) {
            skipCommitRef.current = false;
            setEditing(false);
            return;
          }
          onChange(draft.trim());
          setEditing(false);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            skipCommitRef.current = true;
            setDraft(value);
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <button
      className={`flex min-w-0 items-center rounded-md px-1.5 py-1 text-left transition hover:bg-black/5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mint/30 dark:hover:bg-white/10 dark:focus:bg-white/10 ${className}`}
      onClick={() => setEditing(true)}
      type="button"
    >
      {prefix ? (
        <span className="mr-1 shrink-0 text-xs font-black uppercase text-zinc-500 dark:text-zinc-400">
          {prefix}
        </span>
      ) : null}
      <span className="min-w-0 truncate font-bold">{value || 'Not set'}</span>
    </button>
  );
}

function EditableNumberValue({
  value,
  onChange,
  suffix,
  step = '1',
}: {
  value: number;
  onChange: (value: number) => void;
  suffix: string;
  step?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(String(value));
  const skipCommitRef = useRef(false);

  useEffect(() => {
    if (!editing) {
      setDraft(String(value));
    }
  }, [editing, value]);

  if (editing) {
    return (
      <input
        autoFocus
        className="h-8 w-20 min-w-0 rounded-md border border-black/10 bg-white px-2 text-right text-sm font-bold outline-none transition focus:border-mint focus:ring-2 focus:ring-mint/30 dark:border-white/10 dark:bg-white/10 dark:text-white"
        type="number"
        min="0"
        step={step}
        value={draft}
        onBlur={() => {
          if (skipCommitRef.current) {
            skipCommitRef.current = false;
            setEditing(false);
            return;
          }
          const next = Number(draft);
          if (Number.isFinite(next) && next >= 0) {
            onChange(next);
          } else {
            setDraft(String(value));
          }
          setEditing(false);
        }}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            skipCommitRef.current = true;
            setDraft(String(value));
            event.currentTarget.blur();
          }
        }}
      />
    );
  }

  return (
    <button
      className="rounded-md px-1.5 py-1 text-left transition hover:bg-black/5 focus:bg-white focus:outline-none focus:ring-2 focus:ring-mint/30 dark:hover:bg-white/10 dark:focus:bg-white/10"
      onClick={() => setEditing(true)}
      type="button"
    >
      <span className="font-black tabular-nums">{formatTargetNumber(value)}</span>{' '}
      <span className="text-xs font-bold text-zinc-500 dark:text-zinc-400">{suffix}</span>
    </button>
  );
}

function formatTargetNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  return Number.isInteger(value) ? String(value) : value.toFixed(1).replace(/\.0$/, '');
}

function AutosaveStatus({ status, idleLabel }: { status: SaveStatus; idleLabel: string }) {
  const label = {
    idle: idleLabel,
    saving: 'Saving...',
    saved: 'Saved',
    invalid: 'Needs valid values',
    error: 'Save failed',
  }[status];

  const tone = {
    idle: 'text-zinc-500 dark:text-zinc-400',
    saving: 'text-lagoon',
    saved: 'text-mint',
    invalid: 'text-honey',
    error: 'text-ember',
  }[status];

  return <span className={`text-sm font-bold ${tone}`}>{label}</span>;
}
