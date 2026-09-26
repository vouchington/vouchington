import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { requestReferralLinkUnfurl } from '@services/referral-link-unfurl'

// POST /api/v1/referral-links/:linkId/unfurls - trigger an Amex per-card unfurl of a parent
// referral link (decision #2: the browser crawl never sits on the create path). Ownership,
// the child-parent rejection, and the paid gate all live in requestReferralLinkUnfurl.
app.route('/api/v1/referral-links/:linkId/unfurls').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/referral-links/:linkId/unfurls')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'POST:/api/v1/referral-links/:linkId/unfurls', { path: ctx.params })
  const linkId = validateUUIDParam(ctx, 'linkId')

  const updated = await requestReferralLinkUnfurl(currentUser, linkId)

  ctx.setStatus(202)
  ctx.json({ referral_link: updated })
})
