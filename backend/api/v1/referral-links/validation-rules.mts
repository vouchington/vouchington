import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import {
  getReferralLinkValidationRules,
  createReferralLinkValidationRule,
  updateReferralLinkValidationRule,
  deleteReferralLinkValidationRule,
} from '@services/referral-program-link-validations'
import { createPaginationParser } from '@modules/pagination'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { apiQuery } from '../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'

type CreateReferralLinkValidationRuleBody = {
  hostname: string
  pathname: string
  is_referral_link_url?: boolean | null
  is_invalid_referral_link_url?: boolean | null
  user_error_text?: string | null
  example_urls?: string[] | null
}

type UpdateReferralLinkValidationRuleBody = {
  hostname?: string
  pathname?: string
  is_referral_link_url?: boolean
  is_invalid_referral_link_url?: boolean
  user_error_text?: string | null
  example_urls?: string[] | null
}

const validationRulesParser = createPaginationParser({
  cursor: { type: 'simple' as const },
  limit: { min: 1, max: 100, default: 50 },
})

// GET /api/v1/referral-link-validations/:validationId/rules - list rules (public)
// POST /api/v1/referral-link-validations/:validationId/rules - create a rule (admin-only)
app
  .route('/api/v1/referral-link-validations/:validationId/rules')
  .get(async (ctx: Context) => {
    apiQuery('GET:/api/v1/referral-link-validations/:validationId/rules', validationRulesParser)
    await ctx.applyRouteRateLimit('GET:/api/v1/referral-link-validations/:validationId/rules')
    const options = validationRulesParser.parse(ctx.query)
    const query = prepareQueryForValidation(ctx.query, validationRulesParser.queryContract)
    if (ctx.query.limit !== undefined) query.limit = options.limit
    validateRequestContract(ctx, 'GET:/api/v1/referral-link-validations/:validationId/rules', {
      path: ctx.params,
      query,
    })

    const result = await getReferralLinkValidationRules(
      validateUUIDParam(ctx, 'validationId'),
      options,
    )

    ctx.json({
      results: result.results,
      page_info: result.page_info,
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'POST:/api/v1/referral-link-validations/:validationId/rules',
    )
    const validationId = validateUUIDParam(ctx, 'validationId')

    const body = (await ctx.request.json('1mb')) as CreateReferralLinkValidationRuleBody
    validateRequestContract(ctx, 'POST:/api/v1/referral-link-validations/:validationId/rules', {
      body,
      path: ctx.params,
    })
    ctx.assert(body.hostname, 422, 'hostname is required')
    ctx.assert(body.pathname, 422, 'pathname is required')

    const rule = await createReferralLinkValidationRule(currentUser, validationId, {
      hostname: body.hostname,
      pathname: body.pathname,
      is_referral_link_url: body.is_referral_link_url,
      is_invalid_referral_link_url: body.is_invalid_referral_link_url,
      user_error_text: body.user_error_text,
      example_urls: body.example_urls,
    })

    ctx.setStatus(201)
    ctx.json({ validation_rule: rule })
  })

// PATCH /api/v1/referral-link-validations/:validationId/rules/:ruleId - update a rule (admin-only)
// DELETE /api/v1/referral-link-validations/:validationId/rules/:ruleId - delete a rule (admin-only)
app
  .route('/api/v1/referral-link-validations/:validationId/rules/:ruleId')
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'PATCH:/api/v1/referral-link-validations/:validationId/rules/:ruleId',
    )
    const validationId = validateUUIDParam(ctx, 'validationId')
    const ruleId = validateUUIDParam(ctx, 'ruleId')

    const body = (await ctx.request.json('1mb')) as UpdateReferralLinkValidationRuleBody
    validateRequestContract(
      ctx,
      'PATCH:/api/v1/referral-link-validations/:validationId/rules/:ruleId',
      {
        body,
        path: ctx.params,
      },
    )

    const updated = await updateReferralLinkValidationRule(currentUser, validationId, ruleId, {
      hostname: body.hostname,
      pathname: body.pathname,
      is_referral_link_url: body.is_referral_link_url,
      is_invalid_referral_link_url: body.is_invalid_referral_link_url,
      user_error_text: body.user_error_text,
      example_urls: body.example_urls,
    })

    ctx.assert(updated, 404, 'Validation rule not found')
    ctx.json({ validation_rule: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'DELETE:/api/v1/referral-link-validations/:validationId/rules/:ruleId',
    )
    validateRequestContract(
      ctx,
      'DELETE:/api/v1/referral-link-validations/:validationId/rules/:ruleId',
      { path: ctx.params },
    )

    await deleteReferralLinkValidationRule(
      currentUser,
      validateUUIDParam(ctx, 'validationId'),
      validateUUIDParam(ctx, 'ruleId'),
    )
    ctx.setStatus(204)
  })
