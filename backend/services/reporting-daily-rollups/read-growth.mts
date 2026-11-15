import { read } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils/ids'
import sql from 'sql-template-strings'
import { getReportingDayBounds, getReportingWindows } from './windows.mts'

export const growthCountColumns = [
  'user_count',
  'post_count',
  'review_count',
  'data_point_count',
  'discussion_count',
  'comment_count',
  'story_count',
  'approved_count',
  'reviewed_count',
  'follow_count',
  'vote_count',
  'retained_vote_count',
] as const
export type GrowthDayCounts = { day: string } & Record<(typeof growthCountColumns)[number], number>

export async function readGrowthDayCounts(
  periodStart: Date,
  now = new Date(),
  strictStart = true,
  scope: 'all' | 'content' | 'users' | 'engagement' | 'user-follow-totals' = 'all',
): Promise<GrowthDayCounts[]> {
  const { rows } = await read<GrowthDayCounts>(
    sql`/* readGrowthDayCounts */ `.append(
      buildGrowthDayCounts(periodStart, now, strictStart, scope),
    ),
  )
  return rows
}

function buildGrowthDayCounts(
  periodStart: Date,
  now: Date,
  strictStart: boolean,
  scope: 'all' | 'content' | 'users' | 'engagement' | 'user-follow-totals',
) {
  const windows = getGrowthReadWindows(periodStart, now, strictStart)
  const firstStart = getMinUUIDv7ForDate(windows.firstPartial?.start ?? windows.today.start)
  const firstEnd = getMinUUIDv7ForDate(windows.firstPartial?.end ?? windows.today.start)
  const todayStart = getMinUUIDv7ForDate(windows.today.start)
  const postPredicate = sql`((id > ${firstStart} AND id < ${firstEnd}) OR (id > ${todayStart} OR (id = ${todayStart} AND ${!strictStart || periodStart < windows.today.start})))`
  const statement = sql`WITH source_counts AS (
    SELECT day, user_count, post_count, review_count, data_point_count, discussion_count,
      comment_count, story_count, approved_count, reviewed_count, follow_count, vote_count, retained_vote_count
    FROM growth_metrics_daily_totals WHERE day >= ${windows.completed.start.toISOString().slice(0, 10)}::date AND day < ${windows.completed.end.toISOString().slice(0, 10)}::date`
  if (scope === 'all' || scope === 'content' || scope === 'engagement') {
    statement
      .append(sql` UNION ALL
      SELECT (created_at AT TIME ZONE 'UTC')::date,
        0, count(*), count(*) FILTER (WHERE post_type = 'review'),
        count(*) FILTER (WHERE post_type = 'data_point'), count(*) FILTER (WHERE post_type = 'discussion'),
        count(*) FILTER (WHERE post_type = 'comment'), count(*) FILTER (WHERE post_type = 'story'),
        count(*) FILTER (WHERE approved_at IS NOT NULL),
        count(*) FILTER (WHERE approved_at IS NOT NULL OR rejected_at IS NOT NULL), 0, 0, 0
      FROM posts WHERE deleted_at IS NULL AND `)
      .append(postPredicate)
    if (scope === 'engagement') statement.append(" AND post_type = 'comment'")
    statement.append(' GROUP BY 1')
  }
  if (scope === 'all' || scope === 'users' || scope === 'user-follow-totals') {
    statement
      .append(sql` UNION ALL
      SELECT (created_at AT TIME ZONE 'UTC')::date,
        count(*), 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0
      FROM users WHERE deleted_at IS NULL AND `)
      .append(postPredicate)
      .append(' GROUP BY 1')
  }
  if (scope === 'all' || scope === 'engagement') {
    statement
      .append(sql` UNION ALL
      SELECT (created_at AT TIME ZONE 'UTC')::date,
        0, 0, 0, 0, 0, 0, 0, 0, 0, 0, count(*), 0
      FROM post_votes WHERE score IS NOT NULL AND NOT (score IN (-2, 2) AND NOT score_is_semantic) AND `)
      .append(postPredicate).append(sql`
      GROUP BY 1
      UNION ALL
      SELECT day, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, count
      FROM post_vote_retained_daily_counts WHERE day >= ${windows.today.start.toISOString().slice(0, 10)}::date
        OR (day >= ${(windows.firstPartial?.start ?? windows.today.start).toISOString().slice(0, 10)}::date AND day < ${(windows.firstPartial?.end ?? windows.today.start).toISOString().slice(0, 10)}::date)`)
  }
  if (scope === 'all' || scope === 'engagement' || scope === 'user-follow-totals') {
    statement.append(sql` UNION ALL
      SELECT (created_at AT TIME ZONE 'UTC')::date,
        0, 0, 0, 0, 0, 0, 0, 0, 0, count(*), 0, 0
      FROM relation__user__follow__user WHERE deleted_at IS NULL AND (
        (created_at >= ${windows.firstPartial?.start ?? windows.today.start} AND created_at < ${windows.firstPartial?.end ?? windows.today.start})
        OR created_at >= ${windows.today.start}) GROUP BY 1`)
  }
  statement.append(') SELECT day::text')
  for (const column of growthCountColumns) statement.append(`, sum(${column})::int AS ${column}`)
  statement.append(' FROM source_counts GROUP BY day ORDER BY day')
  return statement
}

export async function countGrowthActiveAuthors(
  periodStart: Date,
  now = new Date(),
): Promise<number> {
  const { rows } = await read<{ count: number }>(
    sql`/* countGrowthActiveAuthors */ `.append(buildGrowthActiveAuthors(periodStart, now)),
  )
  return rows[0]!.count
}

function buildGrowthActiveAuthors(periodStart: Date, now: Date) {
  const windows = getGrowthReadWindows(periodStart, now, true)
  const firstStart = getMinUUIDv7ForDate(windows.firstPartial?.start ?? windows.today.start)
  const firstEnd = getMinUUIDv7ForDate(windows.firstPartial?.end ?? windows.today.start)
  const todayStart = getMinUUIDv7ForDate(windows.today.start)
  return sql`
    SELECT count(DISTINCT author_user_id)::int AS count FROM (
      SELECT author_user_id FROM growth_metrics_daily_post_authors
      WHERE day >= ${windows.completed.start.toISOString().slice(0, 10)}::date AND day < ${windows.completed.end.toISOString().slice(0, 10)}::date
      UNION ALL
      SELECT created_by_id FROM posts WHERE deleted_at IS NULL AND (
        (id > ${firstStart} AND id < ${firstEnd}) OR (id > ${todayStart} OR (id = ${todayStart} AND ${periodStart < windows.today.start})))
    ) authors
  `
}

function getGrowthReadWindows(periodStart: Date, now: Date, strictStart: boolean) {
  const windows = getReportingWindows(periodStart, now)
  if (strictStart && !windows.firstPartial && periodStart < windows.completed.end) {
    const firstDay = getReportingDayBounds(periodStart)
    windows.firstPartial = { start: periodStart, end: firstDay.end }
    windows.completed.start = firstDay.end
  }
  return windows
}

export async function readGrowthRequestFacts(periodStart: Date, now: Date) {
  const dayQuery =
    sql`/* readGrowthRequestDayCounts */ SELECT 'period'::text AS request_window, facts.* FROM (`
      .append(buildGrowthDayCounts(periodStart, now, true, 'all'))
      .append(sql`) facts UNION ALL SELECT 'all'::text AS request_window, facts.* FROM (`)
      .append(buildGrowthDayCounts(new Date(0), now, false, 'user-follow-totals'))
      .append(') facts ORDER BY request_window, day')
  const starts = [
    periodStart,
    new Date(now.getTime() - 86_400_000),
    new Date(now.getTime() - 30 * 86_400_000),
  ]
  const uniqueStarts = [...new Set(starts.map(start => start.getTime()))]
  const authorQuery = sql`/* readGrowthRequestActiveAuthors */ `
  for (const [index, start] of uniqueStarts.entries()) {
    if (index > 0) authorQuery.append(' UNION ALL ')
    authorQuery
      .append(sql`SELECT ${index}::int AS request_window, facts.count FROM (`)
      .append(buildGrowthActiveAuthors(new Date(start), now))
      .append(') facts')
  }
  const [days, authors] = await Promise.all([
    read<GrowthDayCounts & { request_window: string }>(dayQuery),
    read<{ request_window: number; count: number }>(authorQuery),
  ])
  const authorCount = (start: Date) =>
    authors.rows.find(row => row.request_window === uniqueStarts.indexOf(start.getTime()))!.count
  return {
    days: days.rows.filter(row => row.request_window === 'period'),
    allDays: days.rows.filter(row => row.request_window === 'all'),
    activeUsers: authorCount(starts[0]!),
    dau: authorCount(starts[1]!),
    mau: authorCount(starts[2]!),
  }
}
export type GrowthRequestFacts = Awaited<ReturnType<typeof readGrowthRequestFacts>>
