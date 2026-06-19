import { addDays } from './date';
import { round } from './calculations';

type Row = Record<string, string | number | null | undefined>;

export function withForecast<T extends object>(
  rows: T[],
  keys: string[],
  options: { dateKey?: string; days?: number } = {},
) {
  const dateKey = options.dateKey ?? 'date';
  const days = options.days ?? 7;
  if (rows.length === 0) return rows;

  const result = rows.map((row) => ({ ...(row as Row) }));
  const lastDate = String((rows[rows.length - 1] as Row)[dateKey]);

  for (const key of keys) {
    const points = rows
      .map((row, index) => ({ x: index, y: asNumber((row as Row)[key]) }))
      .filter((point): point is { x: number; y: number } => point.y !== null);

    if (points.length <= 3) {
      continue;
    }

    const { slope, intercept } = linearRegression(points);
    const lastActualIndex = points[points.length - 1].x;
    const lastActualValue = points[points.length - 1].y;
    result[lastActualIndex][`${key}Forecast`] = lastActualValue;

    for (let offset = 1; offset <= days; offset += 1) {
      const index = rows.length - 1 + offset;
      const forecastDate = addDays(lastDate, offset);
      const existing = result[rows.length - 1 + offset] ?? { [dateKey]: forecastDate };
      existing[dateKey] = forecastDate;
      existing[`${key}Forecast`] = Math.max(0, round(slope * index + intercept));
      result[rows.length - 1 + offset] = existing;
    }
  }

  return result;
}

function linearRegression(points: Array<{ x: number; y: number }>) {
  const count = points.length;
  const sumX = points.reduce((sum, point) => sum + point.x, 0);
  const sumY = points.reduce((sum, point) => sum + point.y, 0);
  const sumXY = points.reduce((sum, point) => sum + point.x * point.y, 0);
  const sumXX = points.reduce((sum, point) => sum + point.x * point.x, 0);
  const denominator = count * sumXX - sumX * sumX;
  const slope = denominator === 0 ? 0 : (count * sumXY - sumX * sumY) / denominator;
  const intercept = (sumY - slope * sumX) / count;
  return { slope, intercept };
}

function asNumber(value: string | number | null | undefined) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}
