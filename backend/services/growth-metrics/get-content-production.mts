import { growthSeries } from '@services/reporting-daily-rollups/series'
import {
  type GrowthRequestFacts,
  countGrowthActiveAuthors,
  readGrowthDayCounts,
} from '@services/reporting-daily-rollups/read-growth'
import type { GrowthRange, ContentProduction } from './types.mts'

export async function getContentProduction(
  _range: GrowthRange,
  periodStart: Date,
  facts?: GrowthRequestFacts,
): Promise<ContentProduction> {
  const [days, activeUsers] = facts
    ? [facts.days, facts.activeUsers]
    : await Promise.all([
        readGrowthDayCounts(periodStart, new Date(), true, 'content'),
        countGrowthActiveAuthors(periodStart),
      ])
  const total = days.reduce(
    (sum, day) => ({
      posts: sum.posts + day.post_count,
      approved: sum.approved + day.approved_count,
      reviewed: sum.reviewed + day.reviewed_count,
      review: sum.review + day.review_count,
      data_point: sum.data_point + day.data_point_count,
      discussion: sum.discussion + day.discussion_count,
      comment: sum.comment + day.comment_count,
      story: sum.story + day.story_count,
    }),
    {
      posts: 0,
      approved: 0,
      reviewed: 0,
      review: 0,
      data_point: 0,
      discussion: 0,
      comment: 0,
      story: 0,
    },
  )
  return {
    total_posts: total.posts,
    posts_by_type: {
      review: total.review,
      data_point: total.data_point,
      discussion: total.discussion,
      comment: total.comment,
      story: total.story,
    },
    contributions_per_active_user: activeUsers > 0 ? total.posts / activeUsers : 0,
    clearance_approval_rate: total.reviewed > 0 ? total.approved / total.reviewed : 0,
    content_over_time: growthSeries(days, day => day.post_count),
  }
}
