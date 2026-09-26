import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import {
  getUserReferralLinks,
  getUserReferralLink,
  createUserReferralLink,
  updateUserReferralLink,
  deleteUserReferralLink,
  activateUserReferralLink,
  deactivateUserReferralLink,
} from '@services/user-referral-program-links'
import { assertNotSuspended } from '@services/users'
import { createPaginationParser, defineQueryContract, queryUuid } from '@modules/pagination'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import {
  assertCurrentUserCanCreateUserReferralLink,
  assertCurrentUserCanUpdateUserReferralLink,
} from '@services/user-referral-program-links/authorization'

type CreateReferralLinkBody = {
  user_id?: string | null
  referral_program_id: string
  url: string
  label?: string | null
}

type UpdateReferralLinkBody = {
  label?: string | null
}

// Pagination parser for referral links
const referralLinksParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})
const referralLinksQueryContract = defineQueryContract({
  user_id: queryUuid(),
  referral_program_id: queryUuid(),
})

// GET /api/v1/referral-links - list user's referral links
// POST /api/v1/referral-links - create a referral link
app
  .route('/api/v1/referral-links')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/referral-links', referralLinksParser, referralLinksQueryContract)
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/referral-links')
    const paginationOptions = referralLinksParser.parse(ctx.query)
    const validationQuery = prepareQueryForValidation(ctx.query, {
      ...referralLinksParser.queryContract,
      ...referralLinksQueryContract.queryContract,
    })
    if (ctx.query.limit !== undefined) validationQuery.limit = paginationOptions.limit
    validateRequestContract(ctx, 'GET:/api/v1/referral-links', {
      query: validationQuery,
    })

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
    assertNotSuspended(currentUser)

    const body = (await ctx.request.json('1mb')) as CreateReferralLinkBody
    ctx.assert(body !== null && typeof body === 'object', 422, 'Invalid request body')
    const userId = typeof body.user_id === 'string' && body.user_id ? body.user_id : currentUser.id
    assertCurrentUserCanCreateUserReferralLink(currentUser, userId)
    validateRequestContract(ctx, 'POST:/api/v1/referral-links', { body })
    ctx.assert(body.referral_program_id, 422, 'referral_program_id is required')
    ctx.assert(body.url, 422, 'url is required')

    const link = await createUserReferralLink(currentUser, {
      user_id: userId,
      referral_program_id: body.referral_program_id,
      url: body.url,
      label: body.label,
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

    validateRequestContract(ctx, 'PATCH:/api/v1/referral-links/:linkId', { path: ctx.params })
    const linkId = validateUUIDParam(ctx, 'linkId')
    const existing = await getUserReferralLink(linkId)
    ctx.assert(existing, 404, 'Referral link not found')
    assertCurrentUserCanUpdateUserReferralLink(currentUser, existing)

    const body = (await ctx.request.json('1mb')) as UpdateReferralLinkBody
    validateRequestContract(ctx, 'PATCH:/api/v1/referral-links/:linkId', {
      body,
      path: ctx.params,
    })

    const updated = await updateUserReferralLink(currentUser, linkId, {
      label: body.label,
    })

    ctx.assert(updated, 404, 'Referral link not found')
    ctx.json({ referral_link: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/referral-links/:linkId')
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'DELETE:/api/v1/referral-links/:linkId', { path: ctx.params })
    await deleteUserReferralLink(currentUser, validateUUIDParam(ctx, 'linkId'))
    ctx.setStatus(204)
  })

// POST /api/v1/referral-links/:linkId/activations - activate a referral link
app.route('/api/v1/referral-links/:linkId/activations').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/referral-links/:linkId/activations')
  validateRequestContract(ctx, 'POST:/api/v1/referral-links/:linkId/activations', {
    path: ctx.params,
  })

  const activated = await activateUserReferralLink(currentUser, validateUUIDParam(ctx, 'linkId'))
  ctx.assert(activated, 404, 'Referral link not found')

  ctx.json({ referral_link: activated })
})

// DELETE /api/v1/referral-links/:linkId/activations - deactivate a referral link
app.route('/api/v1/referral-links/:linkId/activations').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/referral-links/:linkId/activations')
  validateRequestContract(ctx, 'DELETE:/api/v1/referral-links/:linkId/activations', {
    path: ctx.params,
  })

  const deactivated = await deactivateUserReferralLink(
    currentUser,
    validateUUIDParam(ctx, 'linkId'),
  )
  ctx.assert(deactivated, 404, 'Referral link not found')

  ctx.json({ referral_link: deactivated })
})
