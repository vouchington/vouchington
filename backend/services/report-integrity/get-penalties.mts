import { read, write } from '@data-stores/psql'
import { decodeScopedUuidCursorWithLegacySimple, encodeScopedUuidCursor } from '@modules/pagination'
import sql from 'sql-template-strings'
import type { PageInfo } from '@voucha/types/pagination'

export type ReportAbusePenalty = {
  id: string
  user_id: string
  reason: string
  source_flag_id: string | null
  created_by_id: string | null
  revoked_at: Date | null
  revoked_by_id: string | null
  created_at: Date
  updated_at: Date
}

export type GetReportAbusePenaltiesOptions = {
  status?: 'active' | 'revoked'
  userId?: string
  sourceFlagId?: string
  after?: string
  limit?: number
}

export type GetReportAbusePenaltiesResult = {
  results: ReportAbusePenalty[]
  page_info: PageInfo
}

export async function getReportAbusePenaltyByIdFromPrimary(
  penaltyId: string,
): Promise<ReportAbusePenalty | null> {
  const { rows } = await write(sql`/* getReportAbusePenaltyByIdFromPrimary */
    SELECT
      id,
      user_id,
      reason,
      source_flag_id,
      created_by_id,
      revoked_at,
      revoked_by_id,
      created_at,
      updated_at
    FROM report_abuse_penalties
    WHERE id = ${penaltyId}
  `)
  return (rows[0] as ReportAbusePenalty | undefined) ?? null
}

export async function getReportAbusePenalties(
  options: GetReportAbusePenaltiesOptions = {},
): Promise<GetReportAbusePenaltiesResult> {
  const { status, userId, sourceFlagId, after, limit = 25 } = options
  const clampedLimit = Math.min(Math.max(1, limit), 100)
  const cursorScope = buildReportPenaltyCursorScope({ status, userId, sourceFlagId })
  const afterId = after
    ? decodeScopedUuidCursorWithLegacySimple(after, cursorScope, 'Invalid cursor format').id
    : undefined

  const query = sql`/* getReportAbusePenalties */
    SELECT
      id,
      user_id,
      reason,
      source_flag_id,
      created_by_id,
      revoked_at,
      revoked_by_id,
      created_at,
      updated_at
    FROM report_abuse_penalties
    WHERE TRUE
  `

  if (status === 'active') query.append(sql` AND revoked_at IS NULL`)
  if (status === 'revoked') query.append(sql` AND revoked_at IS NOT NULL`)
  if (userId) query.append(sql` AND user_id = ${userId}`)
  if (sourceFlagId) query.append(sql` AND source_flag_id = ${sourceFlagId}`)
  if (afterId) query.append(sql` AND id < ${afterId}`)

  query.append(sql` ORDER BY id DESC LIMIT ${clampedLimit + 1}`)

  const { rows } = await read(query)
  const penalties = rows as ReportAbusePenalty[]
  const hasNextPage = penalties.length > clampedLimit
  const results = hasNextPage ? penalties.slice(0, clampedLimit) : penalties

  return {
    results,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: results[0] ? encodeScopedUuidCursor(results[0].id, cursorScope) : null,
      end_cursor:
        hasNextPage && results.at(-1)
          ? encodeScopedUuidCursor(results.at(-1)!.id, cursorScope)
          : null,
    },
  }
}

function buildReportPenaltyCursorScope(
  options: Pick<GetReportAbusePenaltiesOptions, 'status' | 'userId' | 'sourceFlagId'>,
): string {
  return JSON.stringify({
    resource: 'report-abuse-penalties',
    status: options.status ?? 'all',
    user_id: options.userId ?? null,
    source_flag_id: options.sourceFlagId ?? null,
    order: 'id-desc',
  })
}
