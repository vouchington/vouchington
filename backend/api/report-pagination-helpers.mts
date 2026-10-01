import type { Context } from '@jongleberry/api-server'
import {
  createPaginationParser,
  defineQueryContract,
  queryEnum,
  queryString,
} from '@modules/pagination'
import {
  MODERATION_REPORT_STATUSES,
  type ModerationReportSort,
  type ModerationReportStatus,
} from '@services/moderation-reports'

const MAX_CURSOR_QUERY_LENGTH = 4096
const REPORT_SORTS = [
  'created_at_asc',
  'created_at_desc',
  'most_reported',
  'severity',
] as const satisfies readonly ModerationReportSort[]

export const reportsPaginationParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

export const reportsFilterQuery = defineQueryContract({
  status: queryEnum(MODERATION_REPORT_STATUSES, {
    default: 'pending',
    description: 'Report status; unknown values use pending.',
  }),
  sort: queryEnum(REPORT_SORTS, {
    description:
      'Staff sort order (default severity); members always get a created_at order and unknown values use the default.',
  }),
  cluster: queryEnum(['entity'] as const, { description: 'Staff-only entity clustering.' }),
  before: queryString({
    description: 'Opaque cursor for the previous page; exclusive with after.',
  }),
})

/** Settles the lenient `status` and `sort` filters: unknown values fall back instead of failing. */
export function parseReportListFilters(
  query: Record<string, unknown>,
  isStaff: boolean,
): { status: ModerationReportStatus; sort: ModerationReportSort } {
  const status = MODERATION_REPORT_STATUSES.find(candidate => candidate === query.status)
  const sortParam = REPORT_SORTS.find(candidate => candidate === query.sort)
  const memberSort = sortParam === 'created_at_asc' ? 'created_at_asc' : 'created_at_desc'
  return { status: status ?? 'pending', sort: isStaff ? (sortParam ?? 'severity') : memberSort }
}

export function parseReportCursorQueryParams(
  ctx: Context,
  query: Record<string, unknown>,
): { after?: string; before?: string } {
  const hasAfter = Object.hasOwn(query, 'after')
  const hasBefore = Object.hasOwn(query, 'before')
  ctx.assert(!(hasAfter && hasBefore), 422, 'Use either after or before')

  const parse = (key: 'after' | 'before'): string | undefined => {
    if (!Object.hasOwn(query, key)) return undefined
    const value = query[key]
    ctx.assert(
      typeof value === 'string' && value.length > 0 && value.length <= MAX_CURSOR_QUERY_LENGTH,
      422,
      `Invalid ${key} cursor`,
    )
    return value
  }
  return { after: parse('after'), before: parse('before') }
}
