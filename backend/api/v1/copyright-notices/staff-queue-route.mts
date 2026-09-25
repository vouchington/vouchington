import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  type CopyrightStaffCase,
  copyrightStaffQueueCursorScope,
  currentUserCanReviewCopyrightNotices,
  listCopyrightStaffQueue,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuth } from '../../response-helpers.mts'
import {
  createPaginationParser,
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'

const staffQueueParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 100 },
})

type CopyrightStaffQueueResponse = {
  copyright_notices: CopyrightStaffCase[]
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
  const options = staffQueueParser.parse(ctx.query)
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(
        options.after,
        copyrightStaffQueueCursorScope,
        'Invalid copyright staff queue cursor',
      )
    : undefined
  const { cases, endCursor, hasNextPage } = await listCopyrightStaffQueue(currentUser, {
    limit: options.limit,
    after,
  })
  const cursorFor = (staffCase: (typeof cases)[number]) =>
    encodeScopedPreciseTimestampCursor(
      staffCase.cursor_received_at,
      staffCase.id,
      copyrightStaffQueueCursorScope,
    )
  const response: CopyrightStaffQueueResponse = {
    copyright_notices: cases.map(({ cursor_received_at: _, ...staffCase }) => staffCase),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: cases[0] ? cursorFor(cases[0]) : null,
      end_cursor: endCursor
        ? encodeScopedPreciseTimestampCursor(
            endCursor.timestamp,
            endCursor.id,
            copyrightStaffQueueCursorScope,
          )
        : null,
    },
  }
  ctx.json(apiResponse('GET:/api/v1/copyright-notices/review-queue', response))
})
