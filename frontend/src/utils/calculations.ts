import type {
  DailyNutrition,
  DailyWorkout,
  ExerciseProgress,
  ExerciseTarget,
  MacroTargets,
  NutritionEntry,
  NutritionTarget,
  NutritionTotals,
  Product,
  StatusState,
} from '../types/models';

export function macroTargets(target: NutritionTarget): MacroTargets {
  return {
    calories: target.targetCalories,
    proteinGrams: Math.round((target.targetCalories * target.proteinPercent) / 100 / 4),
    carbsGrams: Math.round((target.targetCalories * target.carbsPercent) / 100 / 4),
    fatGrams: Math.round((target.targetCalories * target.fatPercent) / 100 / 9),
    fiberGrams: calculateFiberTargetGrams(target.targetCalories),
  };
}

export function calculateFiberTargetGrams(targetCalories: number) {
  return Math.round((Math.max(0, targetCalories) / 1000) * 14);
}

export function nutritionTotals(entries: NutritionEntry[]): NutritionTotals {
  return {
    calories: round(entries.reduce((sum, entry) => sum + entry.calories, 0)),
    protein: round(entries.reduce((sum, entry) => sum + entry.protein, 0)),
    carbs: round(entries.reduce((sum, entry) => sum + entry.carbs, 0)),
    fat: round(entries.reduce((sum, entry) => sum + entry.fat, 0)),
    fiber: round(entries.reduce((sum, entry) => sum + entry.fiber, 0)),
  };
}

export function normalizeNutrition(day: DailyNutrition): DailyNutrition {
  return { ...day, totals: nutritionTotals(day.entries) };
}

export function entryFromProduct(
  product: Product,
  grams: number,
  mealType: NutritionEntry['mealType'],
): NutritionEntry {
  const multiplier = grams / 100;
  return {
    id: crypto.randomUUID(),
    mealType,
    productId: product.id,
    productName: [product.brand, product.name].filter(Boolean).join(' '),
    grams,
    calories: round(product.caloriesPer100g * multiplier),
    protein: round(product.proteinPer100g * multiplier),
    carbs: round(product.carbsPer100g * multiplier),
    fat: round(product.fatPer100g * multiplier),
    fiber: round(product.fiberPer100g * multiplier),
    notes: '',
  };
}

export function normalizeWorkout(day: DailyWorkout): DailyWorkout {
  const totalReps = day.exercises.reduce(
    (sum, exercise) => sum + exercise.sets.reduce((setSum, set) => setSum + safeNumber(set.reps), 0),
    0,
  );
  const totalVolume = day.exercises.reduce(
    (sum, exercise) =>
      sum +
      exercise.sets.reduce(
        (setSum, set) => setSum + safeNumber(set.reps) * safeNumber(set.addedWeightKg),
        0,
      ),
    0,
  );
  return { ...day, totalReps, totalVolume: round(totalVolume) };
}

export function exerciseProgress(target: ExerciseTarget, workout: DailyWorkout): ExerciseProgress {
  const exercise = workout.exercises.find(
    (item) => item.exerciseName.toLowerCase() === target.exerciseName.toLowerCase(),
  );
  const sets = exercise?.sets ?? [];
  const completedReps = sets.reduce((sum, set) => sum + safeNumber(set.reps), 0);
  const targetReps = target.targetTotalReps || target.targetSets * target.targetRepsPerSet;
  const targetSetsCompleted = sets.filter((set) => safeNumber(set.reps) >= target.targetRepsPerSet).length;
  const targetReached = targetSetsCompleted >= target.targetSets;
  return {
    exerciseName: target.exerciseName,
    completedReps,
    targetReps,
    completionPercent: targetReps ? Math.min(100, round((completedReps / targetReps) * 100)) : 0,
    bestSet: sets.length ? Math.max(...sets.map((set) => safeNumber(set.reps))) : 0,
    bestSession: completedReps,
    lastSession: workout.date,
    targetReached,
    recommendation: targetReached ? 'Add weight next time' : 'Keep building toward the target sets',
  };
}

export function statusClasses(state: StatusState) {
  switch (state) {
    case 'green':
      return 'bg-mint/18 text-emerald-700 ring-mint/30 dark:text-mint';
    case 'yellow':
      return 'bg-honey/20 text-amber-700 ring-honey/35 dark:text-honey';
    case 'red':
      return 'bg-ember/16 text-red-700 ring-ember/30 dark:text-ember';
    default:
      return 'bg-zinc-400/14 text-zinc-600 ring-zinc-400/25 dark:text-zinc-300';
  }
}

export function statusDot(state: StatusState) {
  switch (state) {
    case 'green':
      return 'bg-mint';
    case 'yellow':
      return 'bg-honey';
    case 'red':
      return 'bg-ember';
    default:
      return 'bg-zinc-400';
  }
}

export function calculateBmi(weightKg?: number | null, heightCm?: number | null) {
  if (!weightKg || !heightCm) return null;
  const heightM = heightCm / 100;
  if (heightM <= 0) return null;
  return round(weightKg / (heightM * heightM), 1);
}

export function calculateMaintenanceCalories({
  weightKg,
  heightCm,
  age,
  sex,
  activityMultiplier,
}: {
  weightKg?: number | null;
  heightCm?: number | null;
  age?: number | null;
  sex?: string | null;
  activityMultiplier?: number | null;
}) {
  if (!weightKg || !heightCm) return null;
  const safeAge = age && age > 0 ? age : 30;
  const safeActivity = activityMultiplier && activityMultiplier > 0 ? activityMultiplier : 1.55;
  const sexOffset = sex === 'female' ? -161 : 5;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * safeAge + sexOffset;
  return Math.round(bmr * safeActivity);
}

export function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round((Number.isFinite(value) ? value : 0) * factor) / factor;
}

function safeNumber(value: number | null | undefined) {
  return Number.isFinite(value) ? Number(value) : 0;
}
