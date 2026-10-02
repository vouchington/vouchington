import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanReviewCopyrightNotices } from '@services/copyright-notices'
import {
  copyrightStaffQueueParser,
  listCopyrightStaffQueuePage,
} from '@services/copyright-notices/staff-queue-page'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuth } from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'

app.route('/api/v1/copyright-notices/review-queue').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices/review-queue', copyrightStaffQueueParser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/copyright-notices/review-queue')
  assertNotSuspended(currentUser)
  ctx.assert(
    currentUserCanReviewCopyrightNotices(currentUser),
    403,
    'Copyright review staff required',
  )
  ctx.json(
    apiResponse(
      'GET:/api/v1/copyright-notices/review-queue',
      await listCopyrightStaffQueuePage(
        currentUser,
        parseAndValidatePaginatedRequest(
          ctx,
          'GET:/api/v1/copyright-notices/review-queue',
          copyrightStaffQueueParser,
        ),
      ),
    ),
  )
})
