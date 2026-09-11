import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import {
  getReferralLinkValidationRules,
  createReferralLinkValidationRule,
  updateReferralLinkValidationRule,
  deleteReferralLinkValidationRule,
} from '@services/referral-program-link-validations'
import { createPaginationParser } from '@modules/pagination'

const validationRulesParser = createPaginationParser({
  cursor: { type: 'simple' as const },
  limit: { min: 1, max: 100, default: 50 },
})

// GET /api/v1/referral-link-validations/:validationId/rules - list rules (public)
// POST /api/v1/referral-link-validations/:validationId/rules - create a rule (admin-only)
app
  .route('/api/v1/referral-link-validations/:validationId/rules')
  .get(async (ctx: Context) => {
    await ctx.applyRouteRateLimit('GET:/api/v1/referral-link-validations/:validationId/rules')
    const options = validationRulesParser.parse(ctx.query)

    const result = await getReferralLinkValidationRules(ctx.params.validationId!, options)

    ctx.json({
      results: result.results,
      page_info: result.page_info,
    })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/referral-link-validations/:validationId/rules',
    )

    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    ctx.assert(body.hostname, 422, 'hostname is required')
    ctx.assert(body.pathname, 422, 'pathname is required')

    const rule = await createReferralLinkValidationRule(currentUser, ctx.params.validationId!, {
      hostname: body.hostname as string,
      pathname: body.pathname as string,
      is_referral_link_url: body.is_referral_link_url as boolean | undefined,
      is_invalid_referral_link_url: body.is_invalid_referral_link_url as boolean | undefined,
      user_error_text: body.user_error_text as string | null | undefined,
      example_urls: body.example_urls as string[] | null | undefined,
    })

    ctx.setStatus(201)
    ctx.json({ validation_rule: rule })
  })

// PATCH /api/v1/referral-link-validations/:validationId/rules/:ruleId - update a rule (admin-only)
// DELETE /api/v1/referral-link-validations/:validationId/rules/:ruleId - delete a rule (admin-only)
app
  .route('/api/v1/referral-link-validations/:validationId/rules/:ruleId')
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'PATCH:/api/v1/referral-link-validations/:validationId/rules/:ruleId',
    )

    const body = (await ctx.request.json('1mb')) as Record<string, unknown>

    const updated = await updateReferralLinkValidationRule(
      currentUser,
      ctx.params.validationId!,
      ctx.params.ruleId!,
      {
        hostname: body.hostname as string | undefined,
        pathname: body.pathname as string | undefined,
        is_referral_link_url: body.is_referral_link_url as boolean | undefined,
        is_invalid_referral_link_url: body.is_invalid_referral_link_url as boolean | undefined,
        user_error_text: body.user_error_text as string | null | undefined,
        example_urls: body.example_urls as string[] | null | undefined,
      },
    )

    ctx.assert(updated, 404, 'Validation rule not found')
    ctx.json({ validation_rule: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'DELETE:/api/v1/referral-link-validations/:validationId/rules/:ruleId',
    )

    await deleteReferralLinkValidationRule(
      currentUser,
      ctx.params.validationId!,
      ctx.params.ruleId!,
    )
    ctx.setStatus(204)
  })
