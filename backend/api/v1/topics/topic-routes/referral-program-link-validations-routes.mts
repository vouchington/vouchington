import type { Context } from '@jongleberry/api-server'
import {
  linkValidationToReferralProgram,
  unlinkValidationFromReferralProgram,
} from '@services/topics'
import {
  createAndLinkValidationToReferralProgram,
  listReferralLinkValidationsForProgram,
} from '@services/referral-program-link-validations'
import { currentUserCanUpdateTopic } from '@services/topics/authorization'
import { validateUUID } from '@modules/utils'
import app from '../../../app.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../../response-helpers.mts'

// POST /api/v1/topics/:referralProgramId/referral-program/link-validations
app
  .route('/api/v1/topics/:referralProgramId/referral-program/link-validations')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'POST:/api/v1/topics/:referralProgramId/referral-program/link-validations',
    )

    const body = await parseJsonBody<Record<string, unknown>>(ctx)
    ctx.assert(body.validation_id, 422, 'validation_id is required')
    ctx.assert(typeof body.validation_id === 'string', 422, 'validation_id must be a string')
    const validationId = body.validation_id as string
    validateUUID(validationId)

    const referralProgramId = validateUUIDParam(ctx, 'referralProgramId')
    await linkValidationToReferralProgram(currentUser, referralProgramId, validationId)

    ctx.setStatus(204)
  })

// DELETE /api/v1/topics/:referralProgramId/referral-program/link-validations/:validationId
app
  .route('/api/v1/topics/:referralProgramId/referral-program/link-validations/:validationId')
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'DELETE:/api/v1/topics/:referralProgramId/referral-program/link-validations/:validationId',
    )

    const referralProgramId = validateUUIDParam(ctx, 'referralProgramId')
    const validationId = validateUUIDParam(ctx, 'validationId')

    await unlinkValidationFromReferralProgram(currentUser, referralProgramId, validationId)
    ctx.setStatus(204)
  })

// GET /api/v1/topics/:referralProgramId/referral-program/validations
// POST /api/v1/topics/:referralProgramId/referral-program/validations
app
  .route('/api/v1/topics/:referralProgramId/referral-program/validations')
  .get(async (ctx: Context) => {
    await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'GET:/api/v1/topics/:referralProgramId/referral-program/validations',
    )

    const referralProgramId = validateUUIDParam(ctx, 'referralProgramId')
    const results = await listReferralLinkValidationsForProgram(referralProgramId)

    ctx.json({ results })
  })
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'POST:/api/v1/topics/:referralProgramId/referral-program/validations',
    )

    const referralProgramId = validateUUIDParam(ctx, 'referralProgramId')
    const body = await parseJsonBody<{ slug: string; user_help_text?: string }>(ctx)
    ctx.assert(body.slug && typeof body.slug === 'string', 422, 'slug is required')
    ctx.assert(
      body.user_help_text === undefined || typeof body.user_help_text === 'string',
      422,
      'user_help_text must be a string',
    )

    const validation = await createAndLinkValidationToReferralProgram(
      currentUser,
      referralProgramId,
      {
        slug: body.slug,
        user_help_text: body.user_help_text,
      },
    )

    ctx.setStatus(201)
    ctx.json({ validation })
  })
