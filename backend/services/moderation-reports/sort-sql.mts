import { read } from '@data-stores/psql'
import assert from 'http-assert'
import sql, { type SQLStatement } from 'sql-template-strings'
import { BAN_EVASION_SYSTEM_USERNAME } from '@services/users/constants'
import type { ModerationReportStatus } from './config.mts'
import type { ModerationReportStatusSqlAlias } from './target-metadata.mts'

export type ModerationReportSort =
  | 'severity'
  | 'most_reported'
  | 'created_at_desc'
  | 'created_at_asc'

export type ModerationReportCursor = {
  id: string
  reportCount?: number
  severityRank?: number
} | null

export function appendModerationReportCursorPredicate(
  query: SQLStatement,
  sort: ModerationReportSort,
  cursor: Exclude<ModerationReportCursor, null>,
  direction: 'after' | 'before' = 'after',
): void {
  const after = direction === 'after'
  if (sort === 'severity') {
    const reportCount = cursor.reportCount ?? 0
    const severityRank = cursor.severityRank ?? 0
    query.append(sql` AND (`)
    query.append(severityRankSql())
    query.append(after ? sql` < ${severityRank} OR (` : sql` > ${severityRank} OR (`)
    query.append(severityRankSql())
    query.append(
      after
        ? sql` = ${severityRank} AND (report_counts.report_count < ${reportCount} OR (report_counts.report_count = ${reportCount} AND r.id > ${cursor.id}::uuid))))`
        : sql` = ${severityRank} AND (report_counts.report_count > ${reportCount} OR (report_counts.report_count = ${reportCount} AND r.id < ${cursor.id}::uuid))))`,
    )
    return
  }

  if (sort === 'most_reported') {
    const reportCount = cursor.reportCount ?? 0
    query.append(
      after
        ? sql` AND (report_counts.report_count < ${reportCount} OR (report_counts.report_count = ${reportCount} AND r.id > ${cursor.id}::uuid))`
        : sql` AND (report_counts.report_count > ${reportCount} OR (report_counts.report_count = ${reportCount} AND r.id < ${cursor.id}::uuid))`,
    )
    return
  }

  const comparator = (sort === 'created_at_asc') === after ? sql`>` : sql`<`
  query.append(sql` AND r.id `)
  query.append(comparator)
  query.append(sql` ${cursor.id}::uuid`)
}

export function appendModerationReportOrder(
  query: SQLStatement,
  sort: ModerationReportSort,
  limit: number,
  reversed = false,
): void {
  if (sort === 'severity') {
    query.append(sql`
      ORDER BY
        `)
    query.append(severityRankSql())
    query.append(
      reversed
        ? sql` ASC, report_counts.report_count ASC, r.id DESC LIMIT ${limit}`
        : sql` DESC, report_counts.report_count DESC, r.id ASC LIMIT ${limit}`,
    )
    return
  }

  if (sort === 'most_reported') {
    query.append(
      reversed
        ? sql` ORDER BY report_counts.report_count ASC, r.id DESC LIMIT ${limit}`
        : sql` ORDER BY report_counts.report_count DESC, r.id ASC LIMIT ${limit}`,
    )
    return
  }

  const direction = (sort === 'created_at_asc') !== reversed ? sql`ASC` : sql`DESC`
  query.append(sql` ORDER BY r.id `)
  query.append(direction)
  query.append(sql` LIMIT ${limit}`)
}

export function severityRankSql(): SQLStatement {
  return sql`CASE latest_judgement.recommended_action
    WHEN 'escalate' THEN 4
    WHEN 'remove' THEN 3
    WHEN 'warn' THEN 2
    WHEN 'no_action' THEN 1
    ELSE 0
  END`
}

export function appendModerationReportStatusPredicate(
  query: SQLStatement,
  alias: ModerationReportStatusSqlAlias,
  status: ModerationReportStatus,
): void {
  if (status === 'pending') {
    query.append(`${alias}.reviewed_at IS NULL`)
    return
  }
  query.append(`${alias}.reviewed_at IS NOT NULL AND ${alias}.resolution_action = `)
  query.append(sql`${status}::moderation_report_resolution_action`)
}

export async function assertMutableSortCursorIsCurrent(
  cursor: Exclude<ModerationReportCursor, null>,
  sort: ModerationReportSort,
  status: ModerationReportStatus,
  options: { excludeSystemGenerated?: boolean } = {},
): Promise<void> {
  if (sort !== 'severity' && sort !== 'most_reported') return
  assert(cursor.reportCount !== undefined, 422, 'Invalid cursor')
  if (sort === 'severity' && cursor.severityRank === undefined) assert(false, 422, 'Invalid cursor')

  const current = await getModerationReportCursorSortKeys(cursor.id, status, options)
  if (!current || current.report_count !== cursor.reportCount) {
    assert(false, 422, 'Invalid cursor')
  }
  if (sort === 'severity' && current.severity_rank !== cursor.severityRank) {
    assert(false, 422, 'Invalid cursor')
  }
}

async function getModerationReportCursorSortKeys(
  reportId: string,
  status: ModerationReportStatus,
  options: { excludeSystemGenerated?: boolean } = {},
): Promise<{ report_count: number; severity_rank: number } | null> {
  const query = sql`/* getModerationReportCursorSortKeys */
    SELECT
      report_counts.report_count,
      `
  query.append(severityRankSql())
  query.append(sql` AS severity_rank
    FROM moderation_reports r
    LEFT JOIN LATERAL (
      SELECT COUNT(*)::integer AS report_count
      FROM moderation_reports rc
      WHERE COALESCE(rc.post_id, rc.reported_user_id, rc.hostname_id, rc.rss_feed_item_id)
              = COALESCE(r.post_id, r.reported_user_id, r.hostname_id, r.rss_feed_item_id)
        AND `)
  appendModerationReportStatusPredicate(query, 'rc', status)
  query.append(sql`
  `)
  if (options.excludeSystemGenerated) {
    query.append(sql`
        AND NOT EXISTS (
          SELECT 1
          FROM users rcu
          WHERE rcu.id = rc.reporter_user_id
            AND rcu.username = ${BAN_EVASION_SYSTEM_USERNAME}
        )
    `)
  }
  query.append(sql`
    ) report_counts ON true
    LEFT JOIN LATERAL (
      SELECT mj.recommended_action
      FROM moderation_report_judgements mj
      WHERE COALESCE(mj.post_id, mj.reported_user_id, mj.hostname_id, mj.rss_feed_item_id)
              = COALESCE(r.post_id, r.reported_user_id, r.hostname_id, r.rss_feed_item_id)
      ORDER BY mj.id DESC
      LIMIT 1
    ) latest_judgement ON true
    WHERE r.id = ${reportId}::uuid
      AND `)
  appendModerationReportStatusPredicate(query, 'r', status)
  query.append(sql`
  `)
  if (options.excludeSystemGenerated) {
    query.append(sql`
      AND NOT EXISTS (
        SELECT 1
        FROM users ru
        WHERE ru.id = r.reporter_user_id
          AND ru.username = ${BAN_EVASION_SYSTEM_USERNAME}
      )
    `)
  }
  query.append(sql`
    LIMIT 1
  `)
  return (await read<{ report_count: number; severity_rank: number }>(query)).rows[0] ?? null
}
