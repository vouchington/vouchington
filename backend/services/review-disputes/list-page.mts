import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { listReviewDisputes } from './get.mts'
import type { ReviewDisputeStatus } from './config.mts'

export async function listReviewDisputePage(args: {
  audience: 'staff' | 'member'
  disputantUserId?: string
  status?: ReviewDisputeStatus
  limit?: number
  after?: string
}) {
  const status = args.status ?? 'pending'
  const cursorScope = `disputes:${status}:${args.audience}:${args.disputantUserId ?? 'all'}:id-desc`
  const beforeId = args.after
    ? decodeScopedUuidCursor(args.after, cursorScope, 'Invalid cursor format').id
    : undefined
  const { disputes, hasNextPage } = await listReviewDisputes({
    status,
    disputantUserId: args.disputantUserId,
    limit: args.limit ?? 25,
    beforeId,
  })
  return {
    disputes,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: disputes[0] ? encodeScopedUuidCursor(disputes[0].id, cursorScope) : null,
      end_cursor:
        hasNextPage && disputes.at(-1)
          ? encodeScopedUuidCursor(disputes.at(-1)!.id, cursorScope)
          : null,
    },
  }
}
