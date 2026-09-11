import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import type { GrowthRange, UserGrowth, DailyDataPoint } from './types.mts'

export async function getUserGrowth(_range: GrowthRange, periodStart: Date): Promise<UserGrowth> {
  const periodStartUuid = getMinUUIDv7ForDate(periodStart)
  const now = Date.now()
  const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000)
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000)
  const thirtyDaysAgoUuid = getMinUUIDv7ForDate(thirtyDaysAgo)
  const oneDayAgoUuid = getMinUUIDv7ForDate(oneDayAgo)

  const { rows } = await read(sql`/* getUserGrowth */
    WITH visible_users AS MATERIALIZED (
      SELECT id FROM users WHERE deleted_at IS NULL
    ),
    user_summary AS (
      SELECT
        COUNT(*)::INT AS total_users,
        COUNT(*) FILTER (WHERE id > ${periodStartUuid})::INT AS new_users
      FROM visible_users
    ),
    recent_post_activity AS MATERIALIZED (
      SELECT id, created_by_id
      FROM posts
      WHERE deleted_at IS NULL AND id > ${thirtyDaysAgoUuid}
    ),
    activity_summary AS (
      SELECT
        COUNT(DISTINCT created_by_id) FILTER (WHERE id > ${oneDayAgoUuid})::INT AS dau,
        COUNT(DISTINCT created_by_id)::INT AS mau
      FROM recent_post_activity
    ),
    signups_daily AS (
      SELECT
        DATE(uuid_extract_timestamp(id)) AS day,
        COUNT(*)::INT AS count
      FROM visible_users
      WHERE id > ${periodStartUuid}
      GROUP BY day
      ORDER BY day ASC
    )
    SELECT
      (SELECT total_users FROM user_summary) AS total_users,
      (SELECT new_users FROM user_summary) AS new_users,
      (SELECT dau FROM activity_summary) AS dau,
      (SELECT mau FROM activity_summary) AS mau,
      (SELECT COALESCE(json_agg(json_build_object('date', day::TEXT, 'count', count) ORDER BY day ASC), '[]'::json) FROM signups_daily) AS signups_over_time
  `)

  const row = rows[0]!
  const totalUsers = (row.total_users as number) ?? 0
  const newUsers = (row.new_users as number) ?? 0
  const dau = (row.dau as number) ?? 0
  const mau = (row.mau as number) ?? 0
  const signupsOverTime = (row.signups_over_time as DailyDataPoint[]) ?? []

  return {
    total_users: totalUsers,
    new_users: newUsers,
    dau,
    mau,
    dau_mau_ratio: mau > 0 ? dau / mau : 0,
    signups_over_time: signupsOverTime,
  }
}
