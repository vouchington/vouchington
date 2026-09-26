import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuthAndRateLimit,
  validateUUIDParam,
  parseJsonBody,
  validateRequestContract,
} from '../../response-helpers.mts'
import {
  createOfficialReferralLink,
  deleteOfficialReferralLink,
  getOfficialReferralLinks,
  currentUserCanManageOfficialReferralLink,
} from '@services/official-referral-program-links'

// GET /api/v1/referral-programs/:id/official-referral-links
app.route('/api/v1/referral-programs/:id/official-referral-links').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanManageOfficialReferralLink,
    'GET:/api/v1/referral-programs/:id/official-referral-links',
  )
  validateRequestContract(ctx, 'GET:/api/v1/referral-programs/:id/official-referral-links', {
    path: ctx.params,
  })
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
  validateRequestContract(ctx, 'POST:/api/v1/referral-programs/:id/official-referral-links', {
    path: ctx.params,
  })
  const referral_program_id = validateUUIDParam(ctx, 'id')
  const body = await parseJsonBody<{ url: string; label?: string | null }>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/referral-programs/:id/official-referral-links', {
    body,
  })
  ctx.assert(typeof body.url === 'string' && body.url.trim(), 422, 'url is required')
  const link = await createOfficialReferralLink(currentUser, {
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
  validateRequestContract(ctx, 'DELETE:/api/v1/official-referral-links/:linkId', {
    path: ctx.params,
  })
  const linkId = validateUUIDParam(ctx, 'linkId')
  await deleteOfficialReferralLink(currentUser, linkId)
  ctx.setStatus(204)
})
