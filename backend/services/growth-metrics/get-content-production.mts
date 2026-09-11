import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import type { GrowthRange, ContentProduction, DailyDataPoint } from './types.mts'

export async function getContentProduction(
  _range: GrowthRange,
  periodStart: Date,
): Promise<ContentProduction> {
  const periodStartUuid = getMinUUIDv7ForDate(periodStart)

  const { rows } = await read(sql`/* getContentProduction */
    WITH period_posts AS MATERIALIZED (
      SELECT id, post_type, created_by_id, approved_at, rejected_at
      FROM posts
      WHERE deleted_at IS NULL AND id > ${periodStartUuid}
    ),
    post_summary AS (
      SELECT
        COUNT(*)::INT AS total_posts,
        COUNT(*) FILTER (WHERE post_type = 'review')::INT AS review,
        COUNT(*) FILTER (WHERE post_type = 'data_point')::INT AS data_point,
        COUNT(*) FILTER (WHERE post_type = 'discussion')::INT AS discussion,
        COUNT(*) FILTER (WHERE post_type = 'comment')::INT AS comment,
        COUNT(*) FILTER (WHERE post_type = 'story')::INT AS story,
        COUNT(DISTINCT created_by_id)::INT AS active_users,
        COUNT(*) FILTER (WHERE approved_at IS NOT NULL)::INT AS approved,
        COUNT(*) FILTER (WHERE approved_at IS NOT NULL OR rejected_at IS NOT NULL)::INT AS reviewed
      FROM period_posts
    ),
    content_daily AS (
      SELECT
        DATE(uuid_extract_timestamp(id)) AS day,
        COUNT(*)::INT AS count
      FROM period_posts
      GROUP BY day
      ORDER BY day ASC
    )
    SELECT
      (SELECT total_posts FROM post_summary) AS total_posts,
      (SELECT review FROM post_summary) AS review_count,
      (SELECT data_point FROM post_summary) AS data_point_count,
      (SELECT discussion FROM post_summary) AS discussion_count,
      (SELECT comment FROM post_summary) AS comment_count,
      (SELECT story FROM post_summary) AS story_count,
      (SELECT active_users FROM post_summary) AS active_users,
      (SELECT approved FROM post_summary) AS clearance_approved,
      (SELECT reviewed FROM post_summary) AS clearance_reviewed,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'count', count) ORDER BY day ASC), '[]'::json) FROM content_daily) AS content_over_time
  `)

  const row = rows[0]!
  const totalPosts = (row.total_posts as number) ?? 0
  const activeUsers = (row.active_users as number) ?? 0
  const clearanceApproved = (row.clearance_approved as number) ?? 0
  const clearanceReviewed = (row.clearance_reviewed as number) ?? 0
  const contentOverTime = (row.content_over_time as DailyDataPoint[]) ?? []

  return {
    total_posts: totalPosts,
    posts_by_type: {
      review: (row.review_count as number) ?? 0,
      data_point: (row.data_point_count as number) ?? 0,
      discussion: (row.discussion_count as number) ?? 0,
      comment: (row.comment_count as number) ?? 0,
      story: (row.story_count as number) ?? 0,
    },
    contributions_per_active_user: activeUsers > 0 ? totalPosts / activeUsers : 0,
    clearance_approval_rate: clearanceReviewed > 0 ? clearanceApproved / clearanceReviewed : 0,
    content_over_time: contentOverTime,
  }
}
