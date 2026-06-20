export type PageId = 'dashboard' | 'workouts' | 'nutrition' | 'products' | 'progress' | 'settings';

export type StatusState = 'green' | 'yellow' | 'red' | 'gray';

export interface Profile {
  name: string;
  heightCm?: number | null;
  age?: number | null;
  sex?: 'male' | 'female' | string;
  activityMultiplier?: number | null;
  timeZone: string;
  notes: string;
}

export interface Settings {
  nutritionTarget: NutritionTarget;
  defaultExercises: string[];
  exerciseTargets: ExerciseTarget[];
  targetMode: string;
  theme: 'dark' | 'light' | string;
}

export interface NutritionTarget {
  targetCalories: number;
  calorieAdjustment: number;
  proteinPercent: number;
  carbsPercent: number;
  fatPercent: number;
  fiberTargetGrams: number;
  targetMode: 'maintain' | 'lean_bulk' | 'cut' | 'custom' | string;
}

export interface MacroTargets {
  calories: number;
  proteinGrams: number;
  carbsGrams: number;
  fatGrams: number;
  fiberGrams: number;
}

export interface ExerciseTarget {
  id: string;
  exerciseName: string;
  targetSets: number;
  targetRepsPerSet: number;
  targetTotalReps: number;
  targetAddedWeightKg: number;
  targetType: 'reps' | 'weight' | 'volume' | 'duration' | string;
  progressionRule: string;
  isActive: boolean;
}

export interface Product {
  id: string;
  name: string;
  brand: string;
  barcode: string;
  servingSizeGrams: number;
  servingSizeAmount?: number | null;
  servingSizeUnit?: string | null;
  customServings?: ProductCustomServing[];
  caloriesPer100g: number;
  proteinPer100g: number;
  carbsPer100g: number;
  fatPer100g: number;
  fiberPer100g: number;
  source: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCustomServing {
  id: string;
  name: string;
  amount: number;
  unit?: string | null;
}

export interface NutritionEntry {
  id: string;
  mealType: 'breakfast' | 'lunch' | 'dinner' | 'snack' | string;
  productId: string;
  productName: string;
  grams: number;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  notes: string;
}

export interface NutritionTotals {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
}

export interface DailyNutrition {
  date: string;
  entries: NutritionEntry[];
  totals: NutritionTotals;
  notes: string;
}

export interface WorkoutSet {
  reps: number;
  addedWeightKg: number;
  isBodyweight: boolean;
  rir?: number | null;
  rpe?: number | null;
  notes: string;
}

export interface WorkoutExercise {
  exerciseName: string;
  sets: WorkoutSet[];
  notes: string;
}

export interface DailyWorkout {
  date: string;
  title: string;
  exercises: WorkoutExercise[];
  notes: string;
  totalReps: number;
  totalVolume: number;
}

export interface BodyMetric {
  date: string;
  weightKg?: number | null;
  bodyFatPercent?: number | null;
  waistCm?: number | null;
  notes: string;
}

export interface StatusMetric {
  state: StatusState;
  actual: number;
  target: number;
  percent: number;
  label: string;
}

export interface ExerciseProgress {
  exerciseName: string;
  completedReps: number;
  targetReps: number;
  completionPercent: number;
  bestSet: number;
  bestSession: number;
  lastSession?: string | null;
  targetReached: boolean;
  recommendation: string;
}

export interface DailyStatus {
  date: string;
  calories: StatusMetric;
  protein: StatusMetric;
  carbs: StatusMetric;
  fat: StatusMetric;
  fiber: StatusMetric;
  workout: StatusMetric;
  fullDay: StatusMetric;
  bodyWeightKg?: number | null;
  exerciseTargets: ExerciseProgress[];
  notes: string;
}

export interface ProgressPoint {
  date: string;
  calories: number;
  protein: number;
  workoutVolume: number;
  workoutCount: number;
  bodyWeightKg?: number | null;
}

export interface ExerciseProgressPoint {
  date: string;
  exerciseName: string;
  reps: number;
  bestSet: number;
  volume: number;
}

export interface ProgressSummary {
  days: ProgressPoint[];
  statuses: DailyStatus[];
  exercises: Record<string, ExerciseProgressPoint[]>;
}
