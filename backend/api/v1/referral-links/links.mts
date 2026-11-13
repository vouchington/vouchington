import { setAnonymousPublicCacheHeaders } from '../../cache-headers.mts'
import { parseRuntimePagination } from '@voucha/api/runtime-pagination'
import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { clampAnonLimit } from '@services/pagination'
import {
  getOptionalAuthAndRateLimit,
  parseJsonBody,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
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
import {
  prepareUserReferralLinksListQuery,
  userReferralLinksParser,
  userReferralLinksQueryContract,
} from '@services/user-referral-program-links/list-query'
import { apiQuery } from '../../api-query-contract.mts'
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
import { getRequestContentProvenance } from '@modules/request-client-info/content-provenance'

// GET /api/v1/referral-links - list user's referral links
// POST /api/v1/referral-links - create a referral link
app
  .route('/api/v1/referral-links')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/referral-links', userReferralLinksParser, userReferralLinksQueryContract)
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/referral-links')
    const paginationOptions = parseRuntimePagination(userReferralLinksParser, ctx.query)
    const validationQuery = prepareUserReferralLinksListQuery(ctx.query, paginationOptions.limit)
    validateRequestContract(ctx, 'GET:/api/v1/referral-links', {
      query: validationQuery,
    })

    const requestedUserId = ctx.query.user_id ? String(ctx.query.user_id) : undefined
    if (!requestedUserId && !currentUser) ctx.throw(401, 'Unauthorized')
    const referralProgramId = ctx.query.referral_program_id
      ? String(ctx.query.referral_program_id)
      : undefined
    const limit = currentUser ? paginationOptions.limit : clampAnonLimit(paginationOptions.limit)

    const result = await getUserReferralLinks(currentUser, requestedUserId ?? currentUser!.id, {
      limit,
      after: paginationOptions.after,
      referral_program_id: referralProgramId,
    })

    setAnonymousPublicCacheHeaders(ctx, currentUser)
    ctx.json({
      results: result.results,
      page_info: result.page_info,
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'POST:/api/v1/referral-links')
    const provenance = getRequestContentProvenance()
    assertNotSuspended(currentUser)

    const body = (await parseJsonBody(ctx, '1mb')) as CreateReferralLinkBody
    ctx.assert(body !== null && typeof body === 'object', 422, 'Invalid request body')
    const userId = typeof body.user_id === 'string' && body.user_id ? body.user_id : currentUser.id
    assertCurrentUserCanCreateUserReferralLink(currentUser, userId)
    validateRequestContract(ctx, 'POST:/api/v1/referral-links', { body })
    ctx.assert(body.referral_program_id, 422, 'referral_program_id is required')
    ctx.assert(body.url, 422, 'url is required')

    const link = await createUserReferralLink(currentUser, provenance, {
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

    const body = (await parseJsonBody(ctx, '1mb')) as UpdateReferralLinkBody
    validateRequestContract(ctx, 'PATCH:/api/v1/referral-links/:linkId', {
      body,
      path: ctx.params,
    })

    const updated = await updateUserReferralLink(
      currentUser,
      linkId,
      {
        label: body.label,
      },
      undefined,
      existing,
    )

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
  assertNotSuspended(currentUser)
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
  assertNotSuspended(currentUser)
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
