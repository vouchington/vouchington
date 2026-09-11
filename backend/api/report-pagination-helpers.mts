import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'

const MAX_CURSOR_QUERY_LENGTH = 4096

export const reportsPaginationParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

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
