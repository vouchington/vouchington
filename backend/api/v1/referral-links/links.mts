import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import {
  getUserReferralLinks,
  createUserReferralLink,
  updateUserReferralLink,
  deleteUserReferralLink,
  activateUserReferralLink,
  deactivateUserReferralLink,
} from '@services/user-referral-program-links'
import { assertNotSuspended } from '@services/users'
import { createPaginationParser } from '@modules/pagination'
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

// Pagination parser for referral links
const referralLinksParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})

// GET /api/v1/referral-links - list user's referral links
// POST /api/v1/referral-links - create a referral link
app
  .route('/api/v1/referral-links')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/referral-links')

    // Parse pagination options
    const paginationOptions = referralLinksParser.parse(ctx.query)

    // Parse referral-links specific parameters
    const userId = ctx.query.user_id ? String(ctx.query.user_id) : undefined
    const referralProgramId = ctx.query.referral_program_id
      ? String(ctx.query.referral_program_id)
      : undefined

    const result = await getUserReferralLinks(currentUser, userId || currentUser.id, {
      limit: paginationOptions.limit,
      after: paginationOptions.after,
      referral_program_id: referralProgramId,
    })

    ctx.json({
      results: result.results,
      page_info: result.page_info,
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/referral-links')
    const provenance = getRequestContentProvenance()
    assertNotSuspended(currentUser)

    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    const userId = body.user_id || currentUser.id
    ctx.assert(body.referral_program_id, 422, 'referral_program_id is required')
    ctx.assert(body.url, 422, 'url is required')

    const link = await createUserReferralLink(provenance, currentUser, {
      user_id: userId as string,
      referral_program_id: body.referral_program_id as string,
      url: body.url as string,
      label: body.label as string | undefined,
    })

    ctx.setStatus(201)
    ctx.json({ referral_link: link })
  })

// PATCH /api/v1/referral-links/:linkId - update a referral link
// DELETE /api/v1/referral-links/:linkId - delete a referral link
app
  .route('/api/v1/referral-links/:linkId')
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/referral-links/:linkId')
    assertNotSuspended(currentUser)

    const body = (await ctx.request.json('1mb')) as Record<string, unknown>

    const updated = await updateUserReferralLink(currentUser, ctx.params.linkId!, {
      label: body.label as string | undefined,
    })

    ctx.assert(updated, 404, 'Referral link not found')
    ctx.json({ referral_link: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/referral-links/:linkId')
    assertNotSuspended(currentUser)

    await deleteUserReferralLink(currentUser, ctx.params.linkId!)
    ctx.setStatus(204)
  })

// POST /api/v1/referral-links/:linkId/activations - activate a referral link
app.route('/api/v1/referral-links/:linkId/activations').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/referral-links/:linkId/activations')

  const activated = await activateUserReferralLink(currentUser, ctx.params.linkId!)
  ctx.assert(activated, 404, 'Referral link not found')

  ctx.json({ referral_link: activated })
})

// DELETE /api/v1/referral-links/:linkId/activations - deactivate a referral link
app.route('/api/v1/referral-links/:linkId/activations').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/referral-links/:linkId/activations')

  const deactivated = await deactivateUserReferralLink(currentUser, ctx.params.linkId!)
  ctx.assert(deactivated, 404, 'Referral link not found')

  ctx.json({ referral_link: deactivated })
})
