import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  copyrightGuestCapabilityCursorScope,
  currentUserCanReviewCopyrightNotices,
  listCopyrightGuestCapabilities,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import { buildPageInfo, createPaginationParser, decodeScopedUuidCursor } from '@modules/pagination'
import { requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'

const guestCapabilitiesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

// GET /api/v1/copyright-notices/:id/guest-capabilities — staff list of a case's guest access.
// Tokens are shown once at issue; this list lets staff find and revoke them after a reload.
app.route('/api/v1/copyright-notices/:id/guest-capabilities').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices/:id/guest-capabilities', guestCapabilitiesParser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    'GET:/api/v1/copyright-notices/:id/guest-capabilities',
  )
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  const options = guestCapabilitiesParser.parse(ctx.query)
  const scope = copyrightGuestCapabilityCursorScope(noticeId)
  const afterId = options.after
    ? decodeScopedUuidCursor(options.after, scope, 'Invalid cursor format').id
    : undefined
  const { results, hasNextPage } = await listCopyrightGuestCapabilities({
    currentUser,
    noticeId,
    limit: options.limit,
    afterId,
  })
  ctx.json(
    apiResponse('GET:/api/v1/copyright-notices/:id/guest-capabilities', {
      copyright_guest_capabilities: results.map(capability => ({
        id: capability.id,
        issued_at: capability.issued_at.toISOString(),
        issued_by_id: capability.issued_by_id,
        issued_by_username: capability.issued_by_username,
        expires_at: capability.expires_at.toISOString(),
        revoked_at: capability.revoked_at?.toISOString() ?? null,
      })),
      page_info: buildPageInfo(results, { hasNextPage, getCursor: row => ({ id: row.id, scope }) }),
    }),
  )
})
