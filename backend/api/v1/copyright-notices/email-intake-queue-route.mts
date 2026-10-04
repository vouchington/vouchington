import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanReviewCopyrightNotices } from '@services/copyright-notices'
import {
  copyrightEmailIntakeQueueParser,
  listCopyrightStaffEmailIntakePage,
} from '@services/copyright-notices/copyright-email-intake-page'
import { assertNotSuspended } from '@services/users'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
app.route('/api/v1/copyright-email-intakes/review-queue').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-email-intakes/review-queue', copyrightEmailIntakeQueueParser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-email-intakes/review-queue',
  )
  assertNotSuspended(currentUser)
  const options = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/copyright-email-intakes/review-queue',
    copyrightEmailIntakeQueueParser,
  )
  const response = await listCopyrightStaffEmailIntakePage(currentUser, options)
  ctx.json(apiResponse('GET:/api/v1/copyright-email-intakes/review-queue', response))
})
