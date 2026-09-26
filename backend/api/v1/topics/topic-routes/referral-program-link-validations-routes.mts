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
  validateRequestContract,
  validateUUIDParam,
} from '../../../response-helpers.mts'

type LinkReferralProgramValidationBody = { validation_id: string }
type CreateReferralProgramValidationBody = { slug: string; user_help_text?: string | null }

// POST /api/v1/topics/:referralProgramId/referral-program/link-validations
app
  .route('/api/v1/topics/:referralProgramId/referral-program/link-validations')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      currentUserCanUpdateTopic,
      'POST:/api/v1/topics/:referralProgramId/referral-program/link-validations',
    )

    const body = await parseJsonBody<LinkReferralProgramValidationBody>(ctx)
    validateRequestContract(
      ctx,
      'POST:/api/v1/topics/:referralProgramId/referral-program/link-validations',
      { body, path: ctx.params },
    )
    const validationId = body.validation_id
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
    validateRequestContract(
      ctx,
      'DELETE:/api/v1/topics/:referralProgramId/referral-program/link-validations/:validationId',
      { path: ctx.params },
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
    validateRequestContract(
      ctx,
      'GET:/api/v1/topics/:referralProgramId/referral-program/validations',
      {
        path: ctx.params,
      },
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
    const body = await parseJsonBody<CreateReferralProgramValidationBody>(ctx)
    validateRequestContract(
      ctx,
      'POST:/api/v1/topics/:referralProgramId/referral-program/validations',
      {
        body,
        path: ctx.params,
      },
    )
    ctx.assert(body.slug, 422, 'slug is required')

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
