import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  type CopyrightStaffQueueCase,
  type CopyrightStaffQueueCursor,
  copyrightStaffQueueCursorScope,
  currentUserCanReviewCopyrightNotices,
  listCopyrightStaffQueue,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuth } from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import {
  createPaginationParser,
  decodeScopedTierPreciseUuidCursor,
  encodeScopedTierPreciseUuidCursor,
} from '@modules/pagination'

const staffQueueParser = createPaginationParser({
  cursor: { type: 'tier' },
  limit: { min: 1, max: 100, default: 100 },
})
const invalidCursorMessage = 'Invalid copyright staff queue cursor'

type CopyrightStaffQueueResponse = {
  copyright_notices: CopyrightStaffQueueCase[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

app.route('/api/v1/copyright-notices/review-queue').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices/review-queue', staffQueueParser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/copyright-notices/review-queue')
  assertNotSuspended(currentUser)
  ctx.assert(
    currentUserCanReviewCopyrightNotices(currentUser),
    403,
    'Copyright review staff required',
  )
  const options = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/copyright-notices/review-queue',
    staffQueueParser,
  )
  const after = options.after
    ? decodeScopedTierPreciseUuidCursor(
        options.after,
        copyrightStaffQueueCursorScope,
        invalidCursorMessage,
      )
    : undefined
  // Urgency tiers are 0 (missed deadline), 1 (deadline past escalation), and 2 (other work).
  ctx.assert(!after || [0, 1, 2].includes(after.tier), 400, invalidCursorMessage)
  const { cases, endCursor, hasNextPage } = await listCopyrightStaffQueue(currentUser, {
    limit: options.limit,
    after,
  })
  const encode = (cursor: CopyrightStaffQueueCursor) =>
    encodeScopedTierPreciseUuidCursor(
      cursor.timestamp,
      cursor.tier,
      cursor.id,
      copyrightStaffQueueCursorScope,
    )
  const response: CopyrightStaffQueueResponse = {
    copyright_notices: cases.map(({ cursor: _, ...staffCase }) => staffCase),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: cases[0] ? encode(cases[0].cursor) : null,
      end_cursor: endCursor ? encode(endCursor) : null,
    },
  }
  ctx.json(apiResponse('GET:/api/v1/copyright-notices/review-queue', response))
})
