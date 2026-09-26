import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import {
  listReferralLinkValidations,
  getReferralLinkValidation,
  createReferralLinkValidation,
  updateReferralLinkValidation,
  deleteReferralLinkValidation,
} from '@services/referral-program-link-validations'
import { createPaginationParser, defineQueryContract, queryString } from '@modules/pagination'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

type CreateReferralLinkValidationBody = {
  slug: string
  user_help_text?: string | null
}

type UpdateReferralLinkValidationBody = {
  slug?: string
  user_help_text?: string | null
}

const referralLinkValidationsParser = createPaginationParser({
  cursor: { type: 'name' as const },
  limit: { min: 1, max: 100, default: 50 },
})
const referralLinkValidationsQueryContract = defineQueryContract({ search: queryString() })

// GET /api/v1/referral-link-validations - list all validations (public)
// POST /api/v1/referral-link-validations - create a validation (admin-only)
app
  .route('/api/v1/referral-link-validations')
  .get(async (ctx: Context) => {
    apiQuery(
      'GET:/api/v1/referral-link-validations',
      referralLinkValidationsParser,
      referralLinkValidationsQueryContract,
    )
    await ctx.applyRouteRateLimit('GET:/api/v1/referral-link-validations')
    const options = referralLinkValidationsParser.parse(ctx.query)
    const query = prepareQueryForValidation(ctx.query, {
      ...referralLinkValidationsParser.queryContract,
      ...referralLinkValidationsQueryContract.queryContract,
    })
    if (ctx.query.limit !== undefined) query.limit = options.limit
    validateRequestContract(ctx, 'GET:/api/v1/referral-link-validations', { query })

    const rawSearch = ctx.query.search
    ctx.assert(
      rawSearch === undefined || (typeof rawSearch === 'string' && rawSearch.length <= 100),
      422,
      'search must be a string of at most 100 characters',
    )
    const search = typeof rawSearch === 'string' ? rawSearch.trim() || undefined : undefined

    const result = await listReferralLinkValidations({
      ...options,
      ...(search !== undefined ? { search } : {}),
    })

    ctx.json({
      results: result.results,
      page_info: result.page_info,
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'POST:/api/v1/referral-link-validations',
    )

    const body = (await ctx.request.json('1mb')) as CreateReferralLinkValidationBody
    validateRequestContract(ctx, 'POST:/api/v1/referral-link-validations', { body })
    ctx.assert(body.slug, 422, 'slug is required')

    const validation = await createReferralLinkValidation(currentUser, {
      slug: body.slug,
      user_help_text: body.user_help_text,
    })

    ctx.setStatus(201)
    ctx.json({ validation })
  })

// GET /api/v1/referral-link-validations/:idOrSlug - get a validation (public)
// PATCH /api/v1/referral-link-validations/:idOrSlug - update a validation (admin-only)
// DELETE /api/v1/referral-link-validations/:idOrSlug - delete a validation (admin-only)
app
  .route('/api/v1/referral-link-validations/:idOrSlug')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/referral-link-validations/:idOrSlug')
    validateRequestContract(ctx, 'GET:/api/v1/referral-link-validations/:idOrSlug', {
      path: ctx.params,
    })
    const validation = await getReferralLinkValidation(ctx.params.idOrSlug!)
    ctx.assert(validation, 404, 'Validation not found')

    ctx.json({ validation })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PATCH:/api/v1/referral-link-validations/:idOrSlug',
    )
    validateRequestContract(ctx, 'PATCH:/api/v1/referral-link-validations/:idOrSlug', {
      path: ctx.params,
    })

    const body = (await ctx.request.json('1mb')) as UpdateReferralLinkValidationBody
    validateRequestContract(ctx, 'PATCH:/api/v1/referral-link-validations/:idOrSlug', {
      body,
      path: ctx.params,
    })

    const updated = await updateReferralLinkValidation(currentUser, ctx.params.idOrSlug!, {
      slug: body.slug,
      user_help_text: body.user_help_text,
    })

    ctx.assert(updated, 404, 'Validation not found')
    ctx.json({ validation: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'DELETE:/api/v1/referral-link-validations/:idOrSlug',
    )
    validateRequestContract(ctx, 'DELETE:/api/v1/referral-link-validations/:idOrSlug', {
      path: ctx.params,
    })

    await deleteReferralLinkValidation(currentUser, ctx.params.idOrSlug!)
    ctx.setStatus(204)
  })
