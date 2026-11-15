import { growthSeries } from '@services/reporting-daily-rollups/series'
import {
  readGrowthDayCounts,
  type GrowthRequestFacts,
} from '@services/reporting-daily-rollups/read-growth'
import type { GrowthRange, Engagement } from './types.mts'

export async function getEngagement(
  range: GrowthRange,
  periodStart: Date,
  facts?: GrowthRequestFacts,
): Promise<Engagement> {
  const [days, allDays] = facts
    ? [facts.days, facts.allDays]
    : await Promise.all([
        readGrowthDayCounts(periodStart, new Date(), true, 'engagement'),
        readGrowthDayCounts(new Date(0), new Date(), false, 'user-follow-totals'),
      ])
  const votes = (day: (typeof days)[number]) =>
    day.vote_count + (range === 'all' ? day.retained_vote_count : 0)
  const totalUsers = allDays.reduce((sum, day) => sum + day.user_count, 0)
  const totalFollows = allDays.reduce((sum, day) => sum + day.follow_count, 0)
  return {
    votes_cast: days.reduce((sum, day) => sum + votes(day), 0),
    comments_created: days.reduce((sum, day) => sum + day.comment_count, 0),
    follows_created: days.reduce((sum, day) => sum + day.follow_count, 0),
    avg_follows_per_user: totalUsers > 0 ? totalFollows / totalUsers : 0,
    votes_over_time: growthSeries(days, votes),
    comments_over_time: growthSeries(days, day => day.comment_count),
    follows_over_time: growthSeries(days, day => day.follow_count),
  }
}
