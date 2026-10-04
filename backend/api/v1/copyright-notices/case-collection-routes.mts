import type { Context } from '@jongleberry/api-server'
import { createPaginationParser } from '@modules/pagination'
import {
  currentUserCanReviewCopyrightNotices,
  listCopyrightEuSettlements,
  listCopyrightTerritorialComplaints,
} from '@services/copyright-notices'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import { setPrivateNoStoreCacheHeaders } from '../../cache-headers.mts'
import { apiQuery, apiResponse } from '../../response-contract.mts'
import { requireAuth, requireAuthAndRateLimit, validateUUIDParam } from '../../response-helpers.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'

const parser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})
const complaintsRoute = 'GET:/api/v1/copyright-notices/:id/territorial-complaints'
const participantRoute = 'GET:/api/v1/copyright-notices/:id/eu-dispute-settlements'
const staffRoute = 'GET:/api/v1/copyright-notices/:id/eu-dispute-settlements/staff'

app.route('/api/v1/copyright-notices/:id/territorial-complaints').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices/:id/territorial-complaints', parser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanReviewCopyrightNotices,
    complaintsRoute,
  )
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  const options = parseAndValidatePaginatedRequest(ctx, complaintsRoute, parser, { path: true })
  const page = await listCopyrightTerritorialComplaints(currentUser, noticeId, options)
  ctx.json(
    apiResponse('GET:/api/v1/copyright-notices/:id/territorial-complaints', {
      copyright_territorial_complaints: page.results,
      page_info: page.page_info,
    }),
  )
})

// Register the literal /staff suffix before the participant collection route.
app
  .route('/api/v1/copyright-notices/:id/eu-dispute-settlements/staff')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/copyright-notices/:id/eu-dispute-settlements/staff', parser)
    setPrivateNoStoreCacheHeaders(ctx)
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanReviewCopyrightNotices,
      staffRoute,
    )
    assertNotSuspended(currentUser)
    const noticeId = validateUUIDParam(ctx, 'id')
    const options = parseAndValidatePaginatedRequest(ctx, staffRoute, parser, { path: true })
    const page = await listCopyrightEuSettlements(currentUser, noticeId, options, true)
    ctx.json(
      apiResponse('GET:/api/v1/copyright-notices/:id/eu-dispute-settlements/staff', {
        copyright_eu_dispute_settlements: page.results,
        page_info: page.page_info,
      }),
    )
  })

app.route('/api/v1/copyright-notices/:id/eu-dispute-settlements').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/copyright-notices/:id/eu-dispute-settlements', parser)
  setPrivateNoStoreCacheHeaders(ctx)
  const currentUser = await requireAuth(ctx, participantRoute)
  assertNotSuspended(currentUser)
  const noticeId = validateUUIDParam(ctx, 'id')
  const options = parseAndValidatePaginatedRequest(ctx, participantRoute, parser, { path: true })
  const page = await listCopyrightEuSettlements(currentUser, noticeId, options)
  ctx.json(
    apiResponse('GET:/api/v1/copyright-notices/:id/eu-dispute-settlements', {
      copyright_eu_dispute_settlements: page.results,
      page_info: page.page_info,
    }),
  )
})
