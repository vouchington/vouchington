import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { requestReferralLinkUnfurl } from '@services/referral-link-unfurl'

// POST /api/v1/referral-links/:linkId/unfurls - trigger an Amex per-card unfurl of a parent
// referral link (decision #2: the browser crawl never sits on the create path). Ownership,
// the child-parent rejection, and the paid gate all live in requestReferralLinkUnfurl.
app.route('/api/v1/referral-links/:linkId/unfurls').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/referral-links/:linkId/unfurls')
  assertNotSuspended(currentUser)

  const updated = await requestReferralLinkUnfurl(currentUser, ctx.params.linkId!)

  ctx.setStatus(202)
  ctx.json({ referral_link: updated })
})
