import { decodeScopedUuidCursor, encodeScopedUuidCursor } from '@modules/pagination'
import { listModerationAppeals } from './get.mts'
import type { ModerationAppealStatus } from './config.mts'

export async function listModerationAppealPage(args: {
  appellantUserId?: string
  status?: ModerationAppealStatus
  limit?: number
  after?: string
}) {
  const status = args.status ?? 'pending'
  const cursorScope = `appeals:${status}:${args.appellantUserId ?? 'staff-all'}:id-desc`
  const beforeId = args.after
    ? decodeScopedUuidCursor(args.after, cursorScope, 'Invalid cursor format').id
    : undefined
  const { appeals, hasNextPage } = await listModerationAppeals({
    status,
    appellantUserId: args.appellantUserId,
    limit: args.limit ?? 25,
    beforeId,
  })
  return {
    appeals,
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: appeals[0] ? encodeScopedUuidCursor(appeals[0].id, cursorScope) : null,
      end_cursor:
        hasNextPage && appeals.at(-1)
          ? encodeScopedUuidCursor(appeals.at(-1)!.id, cursorScope)
          : null,
    },
  }
}
