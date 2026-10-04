import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  copyrightAcceptedNoticeCursorScope,
  getCopyrightJurisdictionAvailability,
  getCopyrightParticipantNoticeDetail,
  getCopyrightPublicNoticeDetail,
  listAcceptedCopyrightNotices,
} from '@services/copyright-notices'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import {
  createPaginationParser,
  decodeScopedPreciseTimestampCursor,
  encodeScopedPreciseTimestampCursor,
} from '@modules/pagination'
// Registers `/api/v1/copyright-email-intakes/review-queue` before moderator-routes registers the
// `/api/v1/copyright-email-intakes/:id` route that would otherwise capture it.
import './email-intake-queue-route.mts'
import './email-intake-legal-process-route.mts'
import './email-intake-reply-replay-route.mts'
import './case-collection-routes.mts'
import './eu-copyright-routes.mts'
import './eu-copyright-staff-routes.mts'
import './guest-capability-list-route.mts'
import './guest-capability-routes.mts'
import './moderator-routes.mts'
import './repeat-infringer-routes.mts'
import './staff-queue-route.mts'
import './submission-routes.mts'
import './trusted-flagger-routes.mts'
import './jurisdiction-policy-routes.mts'
import './uk-copyright-routes.mts'

const acceptedCopyrightNoticesParser = createPaginationParser({
  cursor: { type: 'precise_timestamp' },
  limit: { min: 1, max: 100, default: 100 },
})

app.route('/api/v1/copyright-notices').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices', acceptedCopyrightNoticesParser)
  setPrivateNoStoreCacheHeaders(ctx)
  await requireAuth(ctx, 'GET:/api/v1/copyright-notices')
  const options = parseAndValidatePaginatedRequest(
    ctx,
    'GET:/api/v1/copyright-notices',
    acceptedCopyrightNoticesParser,
  )
  const after = options.after
    ? decodeScopedPreciseTimestampCursor(
        options.after,
        copyrightAcceptedNoticeCursorScope,
        'Invalid copyright notice cursor',
      )
    : undefined
  const { notices, hasNextPage } = await listAcceptedCopyrightNotices({
    limit: options.limit,
    after,
  })
  const cursorFor = (notice: (typeof notices)[number]) =>
    encodeScopedPreciseTimestampCursor(
      notice.cursor_accepted_at,
      notice.id,
      copyrightAcceptedNoticeCursorScope,
    )
  ctx.json(
    apiResponse('GET:/api/v1/copyright-notices', {
      copyright_notices: notices.map(({ cursor_accepted_at: _, ...notice }) => notice),
      page_info: {
        has_next_page: hasNextPage,
        start_cursor: notices[0] ? cursorFor(notices[0]) : null,
        end_cursor: hasNextPage && notices.at(-1) ? cursorFor(notices.at(-1)!) : null,
      },
    }),
  )
})

app.route('/api/v1/copyright-notices/:id').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  await requireAuth(ctx, 'GET:/api/v1/copyright-notices/:id')
  const noticeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/copyright-notices/:id', { path: ctx.params })
  const notice = await getCopyrightPublicNoticeDetail(noticeId)
  ctx.assert(notice, 404, 'Copyright notice not found')
  ctx.json({ copyright_notice: notice })
})

app.route('/api/v1/copyright-notices/:id/participant').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/copyright-notices/:id/participant')
  const noticeId = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/copyright-notices/:id/participant', {
    path: ctx.params,
  })
  const notice = await getCopyrightParticipantNoticeDetail(noticeId, currentUser)
  ctx.assert(notice, 403, 'You are not a participant in this copyright notice')
  ctx.json({ copyright_notice: notice })
})

app.route('/api/v1/copyright-jurisdiction-availability').get(async (ctx: Context) => {
  setPrivateNoStoreCacheHeaders(ctx)
  await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/copyright-jurisdiction-availability')
  ctx.json(
    apiResponse('GET:/api/v1/copyright-jurisdiction-availability', {
      copyright_jurisdiction_availability: await getCopyrightJurisdictionAvailability(),
    }),
  )
})
