import type { GrowthDayCounts } from './read-growth.mts'

export function growthSeries(days: GrowthDayCounts[], count: (day: GrowthDayCounts) => number) {
  return days.flatMap(day => {
    const value = count(day)
    return value > 0 ? [{ date: day.day, count: value }] : []
  })
}
