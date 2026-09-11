import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import type { GrowthRange, Engagement, DailyDataPoint } from './types.mts'

export async function getEngagement(_range: GrowthRange, periodStart: Date): Promise<Engagement> {
  const periodStartUuid = getMinUUIDv7ForDate(periodStart)

  const { rows } = await read(sql`/* getEngagement */
    WITH votes AS (
      SELECT
        COUNT(*)::INT AS cnt,
        DATE(uuid_extract_timestamp(id)) AS day
      FROM post_votes
      WHERE id > ${periodStartUuid}
        AND score IS NOT NULL
        AND NOT (score IN (-2, 2) AND NOT score_is_semantic)
      GROUP BY day
    ),
    votes_total AS (
      SELECT SUM(cnt)::INT AS cnt FROM votes
    ),
    comments AS (
      SELECT
        COUNT(*)::INT AS cnt,
        DATE(uuid_extract_timestamp(id)) AS day
      FROM posts
      WHERE deleted_at IS NULL AND post_type = 'comment' AND id > ${periodStartUuid}
      GROUP BY day
    ),
    comments_total AS (
      SELECT SUM(cnt)::INT AS cnt FROM comments
    ),
    follows AS (
      SELECT
        COUNT(*)::INT AS cnt,
        DATE(created_at) AS day
      FROM relation__user__follow__user
      WHERE deleted_at IS NULL AND created_at >= ${periodStart}
      GROUP BY day
    ),
    follows_total AS (
      SELECT SUM(cnt)::INT AS cnt FROM follows
    ),
    total_follows AS (
      SELECT COUNT(*)::INT AS cnt FROM relation__user__follow__user WHERE deleted_at IS NULL
    ),
    total_users AS (
      SELECT COUNT(*)::INT AS cnt FROM users WHERE deleted_at IS NULL
    )
    SELECT
      (SELECT cnt FROM votes_total) AS votes_cast,
      (SELECT cnt FROM comments_total) AS comments_created,
      (SELECT cnt FROM follows_total) AS follows_created,
      (SELECT cnt FROM total_follows) AS total_follows,
      (SELECT cnt FROM total_users) AS total_users,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'count', cnt) ORDER BY day ASC), '[]'::json) FROM votes) AS votes_over_time,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'count', cnt) ORDER BY day ASC), '[]'::json) FROM comments) AS comments_over_time,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'count', cnt) ORDER BY day ASC), '[]'::json) FROM follows) AS follows_over_time
  `)

  const row = rows[0]!
  const totalFollows = (row.total_follows as number) ?? 0
  const totalUsers = (row.total_users as number) ?? 0

  return {
    votes_cast: (row.votes_cast as number) ?? 0,
    comments_created: (row.comments_created as number) ?? 0,
    follows_created: (row.follows_created as number) ?? 0,
    avg_follows_per_user: totalUsers > 0 ? totalFollows / totalUsers : 0,
    votes_over_time: (row.votes_over_time as DailyDataPoint[]) ?? [],
    comments_over_time: (row.comments_over_time as DailyDataPoint[]) ?? [],
    follows_over_time: (row.follows_over_time as DailyDataPoint[]) ?? [],
  }
}
