import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { getPrioritizedReferralLinks } from '@services/prioritized-referral-links'
import { validateUUID } from '@modules/utils'
import {
  getOptionalAuthAndRateLimit,
  setAnonymousPublicCacheHeaders,
} from '../../response-helpers.mts'

// GET /api/v1/topics/:id/prioritized-referral-links
app.route('/api/v1/topics/:id/prioritized-referral-links').get(async (ctx: Context) => {
  const referralProgramId = ctx.params.id!
  validateUUID(referralProgramId)

  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/topics/:id/prioritized-referral-links',
  )

  const all = ctx.query.all === 'true'
  if (all && !currentUser) {
    ctx.throw(401, 'Unauthorized')
  }
  const result = await getPrioritizedReferralLinks(currentUser?.id ?? null, referralProgramId, {
    all,
  })
  setAnonymousPublicCacheHeaders(ctx, currentUser, HTTP_CACHE_SHORT_MAX_AGE_SECONDS)

  ctx.json(result)
})
