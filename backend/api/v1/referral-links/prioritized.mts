import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { getPrioritizedReferralLinks } from '@services/prioritized-referral-links'
import { validateUUID } from '@modules/utils'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
  validateRequestContract,
} from '../../response-helpers.mts'
import { defineQueryContract, queryBoolean } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

const prioritizedReferralLinksQueryContract = defineQueryContract({ all: queryBoolean() })

// GET /api/v1/topics/:id/prioritized-referral-links
app.route('/api/v1/topics/:id/prioritized-referral-links').get(async (ctx: Context) => {
  apiQuery(
    'GET:/api/v1/topics/:id/prioritized-referral-links',
    prioritizedReferralLinksQueryContract,
  )
  const referralProgramId = ctx.params.id!
  validateUUID(referralProgramId)

  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/topics/:id/prioritized-referral-links',
  )

  const query = prepareQueryForValidation(
    ctx.query,
    prioritizedReferralLinksQueryContract.queryContract,
  )
  validateRequestContract(ctx, 'GET:/api/v1/topics/:id/prioritized-referral-links', {
    path: ctx.params,
    query,
  })
  const all = query.all === true
  if (all && !currentUser) {
    ctx.throw(401, 'Unauthorized')
  }
  const result = await getPrioritizedReferralLinks(currentUser?.id ?? null, referralProgramId, {
    all,
  })
  setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)

  ctx.json(result)
})
