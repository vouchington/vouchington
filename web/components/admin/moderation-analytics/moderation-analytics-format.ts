import type { DailyTypedCountDataPoint } from '@/types/moderation-analytics'

export function pivotTypedSeries(points: DailyTypedCountDataPoint[]) {
  const keys = [...new Set(points.map(point => point.type))].toSorted()
  const byDate = new Map<string, Record<string, string | number>>()

  for (const point of points) {
    const row = byDate.get(point.date) ?? { date: point.date }
    row[point.type] = point.count
    byDate.set(point.date, row)
  }

  return {
    keys,
    rows: [...byDate.values()].toSorted((a, b) => String(a.date).localeCompare(String(b.date))),
  }
}

export function formatLabel(value: string): string {
  return value
    .split('_')
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

export function formatPercent(value: number, locale: string): string {
  return value.toLocaleString(locale, {
    style: 'percent',
    maximumFractionDigits: 1,
  })
}

export function formatAxisDate(value: string): string {
  return value.slice(5)
}
