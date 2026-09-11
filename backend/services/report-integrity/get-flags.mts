import { read, write } from '@data-stores/psql'
import { decodeScopedUuidCursorWithLegacySimple, encodeScopedUuidCursor } from '@modules/pagination'
import sql from 'sql-template-strings'
import type { PageInfo } from '@voucha/types/pagination'
import type { ReportIntegrityFlag } from './create-flag.mts'
import type { IntegrityFlagStatus } from '@ts-shared/utils/moderation-catalogs'

export type GetReportIntegrityFlagsOptions = {
  status?: IntegrityFlagStatus
  after?: string
  limit?: number
}

export type GetReportIntegrityFlagsResult = {
  results: ReportIntegrityFlag[]
  page_info: PageInfo
}

export async function getReportIntegrityFlagByIdFromPrimary(
  id: string,
): Promise<ReportIntegrityFlag | null> {
  const { rows } = await write(sql`/* getReportIntegrityFlagByIdFromPrimary */
    SELECT
      id,
      post_id,
      reported_user_id,
      hostname_id,
      rss_feed_item_id,
      flag_type,
      reporter_count,
      new_account_reporter_pct,
      details,
      resolved_at,
      resolved_by_id,
      resolution,
      created_at
    FROM report_integrity_flags
    WHERE id = ${id}
  `)
  return (rows[0] as ReportIntegrityFlag) ?? null
}

export async function getReportIntegrityFlags(
  options: GetReportIntegrityFlagsOptions = {},
): Promise<GetReportIntegrityFlagsResult> {
  const { status, after, limit = 25 } = options
  const clampedLimit = Math.min(Math.max(1, limit), 100)
  const cursorScope = buildReportFlagCursorScope(status)

  let afterId: string | undefined
  if (after) {
    const cursor = decodeScopedUuidCursorWithLegacySimple(
      after,
      cursorScope,
      'Invalid cursor format',
    )
    afterId = cursor.id
  }

  const query = sql`/* getReportIntegrityFlags */
    SELECT
      id,
      post_id,
      reported_user_id,
      hostname_id,
      rss_feed_item_id,
      flag_type,
      reporter_count,
      new_account_reporter_pct,
      details,
      resolved_at,
      resolved_by_id,
      resolution,
      created_at
    FROM report_integrity_flags
    WHERE TRUE
  `

  if (status === 'pending') {
    query.append(sql` AND resolved_at IS NULL`)
  } else if (status === 'resolved') {
    query.append(sql` AND resolved_at IS NOT NULL`)
  }

  if (afterId) {
    query.append(sql` AND id < ${afterId}`)
  }

  query.append(sql` ORDER BY id DESC LIMIT ${clampedLimit + 1}`)

  const { rows } = await read(query)
  const flags = rows as ReportIntegrityFlag[]
  const hasNextPage = flags.length > clampedLimit
  const results = hasNextPage ? flags.slice(0, clampedLimit) : flags
  const lastNode = results[results.length - 1]

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor: hasNextPage && lastNode ? encodeScopedUuidCursor(lastNode.id, cursorScope) : null,
      start_cursor: results[0] ? encodeScopedUuidCursor(results[0].id, cursorScope) : null,
    },
  }
}

function buildReportFlagCursorScope(status?: IntegrityFlagStatus): string {
  return JSON.stringify({
    resource: 'report-integrity-flags',
    status: status ?? 'all',
    order: 'id-desc',
  })
}
