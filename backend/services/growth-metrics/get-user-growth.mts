import { growthSeries } from '@services/reporting-daily-rollups/series'
import {
  countGrowthActiveAuthors,
  readGrowthDayCounts,
} from '@services/reporting-daily-rollups/read-growth'
import type { GrowthRange, UserGrowth } from './types.mts'

export async function getUserGrowth(_range: GrowthRange, periodStart: Date): Promise<UserGrowth> {
  const now = Date.now()
  const [days, allDays, dau, mau] = await Promise.all([
    readGrowthDayCounts(periodStart, new Date(), true, 'users'),
    readGrowthDayCounts(new Date(0), new Date(), false, 'users'),
    countGrowthActiveAuthors(new Date(now - 86_400_000)),
    countGrowthActiveAuthors(new Date(now - 30 * 86_400_000)),
  ])
  return {
    total_users: allDays.reduce((sum, day) => sum + day.user_count, 0),
    new_users: days.reduce((sum, day) => sum + day.user_count, 0),
    dau,
    mau,
    dau_mau_ratio: mau > 0 ? dau / mau : 0,
    signups_over_time: growthSeries(days, day => day.user_count),
  }
}
