import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  type CopyrightStaffEmailIntakeQueueItem,
  copyrightStaffEmailIntakeQueueCursorScope,
  currentUserCanReviewCopyrightNotices,
  searchCopyrightStaffEmailIntakes,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import {
  createPaginationParser,
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'

const emailIntakeQueueParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 100 },
})

type CopyrightEmailIntakeQueueResponse = {
  copyright_email_intakes: CopyrightStaffEmailIntakeQueueItem[]
  page_info: {
    has_next_page: boolean
    start_cursor: string | null
    end_cursor: string | null
  }
}

app.route('/api/v1/copyright-email-intakes/review-queue').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-email-intakes/review-queue', emailIntakeQueueParser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-email-intakes/review-queue',
  )
  assertNotSuspended(currentUser)
  const options = emailIntakeQueueParser.parse(ctx.query)
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(
        options.after,
        copyrightStaffEmailIntakeQueueCursorScope,
        'Invalid copyright email intake queue cursor',
      )
    : undefined
  const { intakes, hasNextPage } = await searchCopyrightStaffEmailIntakes(currentUser, {
    limit: options.limit,
    after,
  })
  const cursorFor = (intake: (typeof intakes)[number]) =>
    encodeScopedPreciseTimestampCursor(
      intake.cursor_received_at,
      intake.id,
      copyrightStaffEmailIntakeQueueCursorScope,
    )
  const lastIntake = intakes.at(-1)
  const response: CopyrightEmailIntakeQueueResponse = {
    copyright_email_intakes: intakes.map(({ cursor_received_at: _, ...intake }) => intake),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: intakes[0] ? cursorFor(intakes[0]) : null,
      end_cursor: hasNextPage && lastIntake ? cursorFor(lastIntake) : null,
    },
  }
  ctx.json(apiResponse('GET:/api/v1/copyright-email-intakes/review-queue', response))
})
