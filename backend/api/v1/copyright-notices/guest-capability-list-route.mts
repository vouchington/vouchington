import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { currentUserCanReviewCopyrightNotices } from '@services/copyright-notices'
import {
  copyrightGuestCapabilitiesParser,
  listCopyrightGuestCapabilityPage,
} from '@services/copyright-notices/guest-capability-page'
import { assertNotSuspended } from '@services/users'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'

// GET /api/v1/copyright-notices/:id/guest-capabilities — staff list of a case's guest access.
// Tokens are shown once at issue; this list lets staff find and revoke them after a reload.
app.route('/api/v1/copyright-notices/:id/guest-capabilities').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices/:id/guest-capabilities', copyrightGuestCapabilitiesParser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-notices/:id/guest-capabilities',
  )
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  const options = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/copyright-notices/:id/guest-capabilities',
    copyrightGuestCapabilitiesParser,
    { path: true },
  )
  const response = await listCopyrightGuestCapabilityPage(currentUser, noticeId, options)
  ctx.json(apiResponse('GET:/api/v1/copyright-notices/:id/guest-capabilities', response))
})
