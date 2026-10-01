import type { Context } from '@jongleberry/api-server'
import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { validateRequestContract } from './response-helpers.mts'

export type CaseListQuery<TStatus extends string> = {
  status: TStatus
  limit: number
  after: string | undefined
  mine: boolean
}

/**
 * Reads the filters of a status-keyed case list (`GET /appeals`, `GET /disputes`) and validates
 * them against the operation's generated request contract. Unreadable limits and unknown statuses
 * settle to the defaults (25 rows, `pending`), so the contract checks the settled values and
 * rejects only a fractional limit, which used to reach SQL and answer 500. Call this after the
 * route's authentication step.
 */
export function parseAndValidateCaseListQuery<TStatus extends string>(
  ctx: Context,
  operation: string,
  statuses: readonly TStatus[],
): CaseListQuery<TStatus> {
  const limitRaw = ctx.query.limit !== undefined ? Number(ctx.query.limit) : 25
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 100) : 25

  const statusParam = ctx.query.status
  const status =
    typeof statusParam === 'string' && statuses.includes(statusParam as TStatus)
      ? (statusParam as TStatus)
      : ('pending' as TStatus)

  const after = typeof ctx.query.after === 'string' ? ctx.query.after : undefined
  const mine = ctx.query.mine === 'true'
  validateRequestContract(ctx, operation, {
    query: {
      status,
      limit,
      ...(mine && { mine: true }),
      ...(after !== undefined && { after }),
    },
  })

  return { status, limit, after, mine }
}

/** The row id a scoped `after` cursor points past, or `undefined` for the first page. */
export function beforeIdFromCursor(after: string | undefined, cursorScope: string) {
  return after !== undefined
    ? decodeScopedUuidCursor(after, cursorScope, 'Invalid cursor format').id
    : undefined
}

/** The `page_info` envelope for rows paged by descending id under `cursorScope`. */
export function scopedPageInfo(
  rows: readonly { id: string }[],
  hasNextPage: boolean,
  cursorScope: string,
) {
  return {
    has_next_page: hasNextPage,
    start_cursor: rows[0] ? encodeScopedUuidCursor(rows[0].id, cursorScope) : null,
    end_cursor:
      hasNextPage && rows.at(-1) ? encodeScopedUuidCursor(rows.at(-1)!.id, cursorScope) : null,
  }
}
