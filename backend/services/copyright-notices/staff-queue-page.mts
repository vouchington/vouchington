import assert from 'http-assert'
import {
  createPaginationParser,
  decodeScopedTierPreciseUuidCursor,
  encodeScopedTierPreciseUuidCursor,
} from '@modules/pagination'
import type { PrivateUser } from '@services/users/types'
import {
  listCopyrightStaffQueue,
  copyrightStaffQueueCursorScope,
  type CopyrightStaffQueueCursor,
} from './read-models-staff.mts'

export const copyrightStaffQueueParser = createPaginationParser({
  cursor: { type: 'tier' },
  limit: { min: 1, max: 100, default: 100 },
})
export async function listCopyrightStaffQueuePage(
  currentUser: PrivateUser,
  args: { after?: string; limit: number },
) {
  const message = 'Invalid copyright staff queue cursor'
  const after = args.after
    ? decodeScopedTierPreciseUuidCursor(args.after, copyrightStaffQueueCursorScope, message)
    : undefined
  assert(!after || [0, 1, 2].includes(after.tier), 400, message)
  const { cases, endCursor, hasNextPage } = await listCopyrightStaffQueue(currentUser, {
    limit: args.limit,
    after,
  })
  const encode = (cursor: CopyrightStaffQueueCursor) =>
    encodeScopedTierPreciseUuidCursor(
      cursor.timestamp,
      cursor.tier,
      cursor.id,
      copyrightStaffQueueCursorScope,
    )
  return {
    copyright_notices: cases.map(({ cursor: _, ...staffCase }) => staffCase),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: cases[0] ? encode(cases[0].cursor) : null,
      end_cursor: endCursor ? encode(endCursor) : null,
    },
  }
}
