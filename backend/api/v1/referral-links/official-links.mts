import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuthAndRateLimit,
  validateUUIDParam,
  parseJsonBody,
} from '../../response-helpers.mts'
import {
  createOfficialReferralLink,
  deleteOfficialReferralLink,
  getOfficialReferralLinks,
  currentUserCanManageOfficialReferralLink,
} from '@services/official-referral-program-links'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

// GET /api/v1/referral-programs/:id/official-referral-links
app.route('/api/v1/referral-programs/:id/official-referral-links').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageOfficialReferralLink,
    'GET:/api/v1/referral-programs/:id/official-referral-links',
  )
  const referral_program_id = validateUUIDParam(ctx, 'id')
  const links = await getOfficialReferralLinks(referral_program_id)
  ctx.json({ official_referral_links: links })
})

// POST /api/v1/referral-programs/:id/official-referral-links
app.route('/api/v1/referral-programs/:id/official-referral-links').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageOfficialReferralLink,
    'POST:/api/v1/referral-programs/:id/official-referral-links',
  )
  const provenance = getRequestContentProvenance()
  const referral_program_id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<{ url: string; label?: string | null }>(ctx)
  ctx.assert(typeof body.url === 'string' && body.url.trim(), 422, 'url is required')
  const link = await createOfficialReferralLink(provenance, currentUser, {
    referral_program_id,
    url: body.url.trim(),
    label: body.label,
  })
  ctx.setStatus(201)
  ctx.json({ official_referral_link: link })
})

// DELETE /api/v1/official-referral-links/:linkId
app.route('/api/v1/official-referral-links/:linkId').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageOfficialReferralLink,
    'DELETE:/api/v1/official-referral-links/:linkId',
  )
  const linkId = validateUUIDParam(ctx, 'linkId')
  await deleteOfficialReferralLink(currentUser, linkId)
  ctx.setStatus(204)
})
