import type {
  BodyMetric,
  DailyNutrition,
  DailyStatus,
  DailyWorkout,
  ExerciseProgressPoint,
  ExerciseTarget,
  Product,
  Profile,
  ProgressSummary,
  Settings,
} from '../types/models';

const apiBase = (import.meta.env.VITE_API_BASE_URL || '/api').replace(/\/$/, '');

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const headers = new Headers(init.headers);
  const password = localStorage.getItem('diary-password');

  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  if (password) {
    headers.set('x-diary-password', password);
  }

  const response = await fetch(`${apiBase}${path}`, { ...init, headers });
  if (!response.ok) {
    let message = `${response.status} ${response.statusText}`;
    try {
      const body = (await response.json()) as { error?: string };
      message = body.error ?? message;
    } catch {
      // Keep the HTTP status text when the server returns non-JSON.
    }
    throw new Error(message);
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}

const body = (value: unknown) => JSON.stringify(value);

export const api = {
  profile: () => request<Profile>('/profile'),
  saveProfile: (profile: Profile) => request<Profile>('/profile', { method: 'PUT', body: body(profile) }),

  settings: () => request<Settings>('/settings'),
  saveSettings: (settings: Settings) =>
    request<Settings>('/settings', { method: 'PUT', body: body(settings) }),

  exerciseTargets: () => request<ExerciseTarget[]>('/exercise-targets'),
  createExerciseTarget: (target: ExerciseTarget) =>
    request<ExerciseTarget>('/exercise-targets', { method: 'POST', body: body(target) }),
  updateExerciseTarget: (target: ExerciseTarget) =>
    request<ExerciseTarget>(`/exercise-targets/${target.id}`, { method: 'PUT', body: body(target) }),
  deleteExerciseTarget: (id: string) =>
    request<void>(`/exercise-targets/${id}`, { method: 'DELETE' }),

  products: () => request<Product[]>('/products'),
  createProduct: (product: Product) =>
    request<Product>('/products', { method: 'POST', body: body(product) }),
  updateProduct: (product: Product) =>
    request<Product>(`/products/${product.id}`, { method: 'PUT', body: body(product) }),
  deleteProduct: (id: string) => request<void>(`/products/${id}`, { method: 'DELETE' }),
  searchProducts: (query: string) =>
    request<Product[]>(`/products/search?query=${encodeURIComponent(query)}`),
  barcode: (barcode: string) => request<Product>(`/products/barcode/${encodeURIComponent(barcode)}`),

  nutrition: (date: string) => request<DailyNutrition>(`/nutrition/${date}`),
  saveNutrition: (date: string, day: DailyNutrition) =>
    request<DailyNutrition>(`/nutrition/${date}`, { method: 'PUT', body: body(day) }),

  workout: (date: string) => request<DailyWorkout>(`/workouts/${date}`),
  saveWorkout: (date: string, day: DailyWorkout) =>
    request<DailyWorkout>(`/workouts/${date}`, { method: 'PUT', body: body(day) }),

  bodyMetric: (date: string) => request<BodyMetric>(`/body-metrics/${date}`),
  saveBodyMetric: (date: string, metric: BodyMetric) =>
    request<BodyMetric>(`/body-metrics/${date}`, { method: 'PUT', body: body(metric) }),

  dailyStatus: (date: string) => request<DailyStatus>(`/daily-status/${date}`),
  dailyStatusRange: (from: string, to: string) =>
    request<DailyStatus[]>(`/daily-status/range?from=${from}&to=${to}`),
  progressSummary: (days = 84, to?: string) =>
    request<ProgressSummary>(`/progress/summary?days=${days}${to ? `&to=${to}` : ''}`),
  exerciseProgress: (exerciseName: string, days = 180) =>
    request<ExerciseProgressPoint[]>(
      `/progress/exercise/${encodeURIComponent(exerciseName)}?days=${days}`,
    ),
};
