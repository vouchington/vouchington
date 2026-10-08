import { createHash } from 'node:crypto'
import createHttpError from 'http-errors'
import { isUUID } from '@modules/utils'
import { read, write } from '@data-stores/psql'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import sql from 'sql-template-strings'
import type { PageInfo } from '@voucha/types/pagination'
import { FLAG_COLUMNS } from './flag-columns.mts'
import type { ReportIntegrityFlag } from './create-flag.mts'
import type { IntegrityFlagStatus } from '@ts-shared/utils/moderation-catalogs'

export type GetReportIntegrityFlagsOptions = {
  status?: IntegrityFlagStatus
  ids?: readonly string[]
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
  const query = sql`/* getReportIntegrityFlagByIdFromPrimary */
    SELECT`
  query.append(FLAG_COLUMNS)
  query.append(sql`
    FROM report_integrity_flags
    WHERE id = ${id}
  `)
  const { rows } = await write(query)
  return (rows[0] as ReportIntegrityFlag) ?? null
}

export async function getReportIntegrityFlags(
  options: GetReportIntegrityFlagsOptions = {},
): Promise<GetReportIntegrityFlagsResult> {
  const { status, after, limit = 25 } = options
  const clampedLimit = Math.min(Math.max(1, limit), 100)
  const ids = normalizeFlagIds(options.ids)
  const cursorScope = buildReportFlagCursorScope(status, ids)

  let afterId: string | undefined
  if (after) {
    const cursor = decodeScopedUuidCursor(after, cursorScope, 'Invalid cursor format')
    afterId = cursor.id
  }

  const query = sql`/* getReportIntegrityFlags */
    SELECT`
  query.append(FLAG_COLUMNS)
  query.append(sql`
    FROM report_integrity_flags
    WHERE TRUE
  `)

  if (ids !== undefined) query.append(sql` AND id = ANY(${ids}::uuid[])`)

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

function buildReportFlagCursorScope(
  status: IntegrityFlagStatus | undefined,
  ids: readonly string[] | undefined,
): string {
  return JSON.stringify({
    resource: 'report-integrity-flags',
    status: status ?? 'all',
    ...(ids === undefined
      ? {}
      : { ids_sha256: createHash('sha256').update(JSON.stringify(ids)).digest('hex') }),
    order: 'id-desc',
  })
}

function normalizeFlagIds(ids: readonly string[] | undefined): string[] | undefined {
  if (ids === undefined) return undefined
  const message = 'ids must contain at most 100 valid UUIDs'
  if (!Array.isArray(ids) || ids.length > 100) throw createHttpError(422, message)
  const normalized = new Set<string>()
  for (const id of ids) {
    if (typeof id !== 'string' || !isUUID(id)) throw createHttpError(422, message)
    normalized.add(id.toLowerCase())
  }
  return [...normalized].toSorted()
}
