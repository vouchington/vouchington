import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getAllReferralLinksPage,
  getPrioritizedReferralLinks,
} from '@services/prioritized-referral-links'
import { validateUUID } from '@modules/utils'
import { createPaginationParser } from '@modules/pagination'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
} from '../../response-helpers.mts'
import { defineQueryContract, queryBoolean } from '@vouchington/pagination'
import { apiQuery } from '../../api-query-contract.mts'
import { parseAndValidatePaginatedRequest } from '../../validate-paginated-query.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const allFlagQuery = defineQueryContract({ all: queryBoolean() })
const prioritizedReferralLinksParser = createPaginationParser({
  cursor: { type: 'simple' as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {},
})

// GET /api/v1/topics/:id/prioritized-referral-links
// Without `all`: official links plus the viewer's network (or the shared top links).
// With `all`: every visible link, newest first, paged by `after` and `limit`.
app.route('/api/v1/topics/:id/prioritized-referral-links').get(async (ctx: Context) => {
  const operation = 'GET:/api/v1/topics/:id/prioritized-referral-links'
  apiQuery(operation, prioritizedReferralLinksParser, allFlagQuery)
  const referralProgramId = ctx.params.id!
  validateUUID(referralProgramId)

  const currentUser = await getOptionalAuthAndRateLimit(ctx, operation)

  const pagination = parseAndValidatePaginatedRequest(
    ctx,
    operation,
    prioritizedReferralLinksParser,
    { path: true, extraQueryContracts: [allFlagQuery.queryContract] },
  )
  const all = prepareQueryForValidation(ctx.query, allFlagQuery.queryContract).all === true
  if (all && !currentUser) {
    ctx.throw(401, 'Unauthorized')
  }
  const result = all
    ? await getAllReferralLinksPage(currentUser!.id, referralProgramId, pagination)
    : await getPrioritizedReferralLinks(currentUser?.id ?? null, referralProgramId)
  setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)

  ctx.json(result)
})
