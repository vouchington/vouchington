import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  admitCopyrightEmailCorrespondenceDecision,
  rejectCopyrightEmailCorrespondenceDecision,
} from '@services/copyright-notices/copyright-email-decision-actions'
import { parseCopyrightTargetIds } from '@services/copyright-notices/http-input'
import {
  parseCopyrightCorrespondenceSubmission,
  parseCopyrightManualFallbackReason,
  parseCopyrightRecommendationId,
} from '@services/copyright-notices/moderator-http-input'
import { validateRequestContract } from '../../response-helpers.mts'
import { apiRequestContract } from '@vouchington/utils/api-response-contract'
import type {
  CopyrightEmailCorrespondenceRejectionRequest,
  CopyrightEmailCorrespondenceRequest,
} from './email-intake-request-types.mts'
import { parseCopyrightReviewRequest } from './moderator-review-request-helpers.mts'

app.route('/api/v1/copyright-email-intakes/:id/correspondence').post(async (ctx: Context) => {
  apiRequestContract<
    'POST:/api/v1/copyright-email-intakes/:id/correspondence',
    CopyrightEmailCorrespondenceRequest
  >('POST:/api/v1/copyright-email-intakes/:id/correspondence')
  const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
    ctx,
    'POST:/api/v1/copyright-email-intakes/:id/correspondence',
  )
  const kinds = [
    'supplement',
    'appeal',
    'counter_notice',
    'withdrawal',
    'court_or_ccb_hold',
    'complaint',
  ] as const
  ctx.assert(
    kinds.includes(body.kind as (typeof kinds)[number]),
    422,
    'Invalid correspondence kind',
  )
  const targetIds =
    body.kind === 'appeal' || body.kind === 'counter_notice'
      ? parseCopyrightTargetIds(body.target_ids)
      : []
  const structuredSubmission = parseCopyrightCorrespondenceSubmission(body)
  const recommendationId = parseCopyrightRecommendationId(body)
  const manualFallbackReason = parseCopyrightManualFallbackReason(body)
  validateRequestContract(ctx, 'POST:/api/v1/copyright-email-intakes/:id/correspondence', {
    path: ctx.params,
    body,
  })
  const admitted = await admitCopyrightEmailCorrespondenceDecision({
    currentUser,
    intakeId,
    kind: body.kind as (typeof kinds)[number],
    targetIds,
    structuredSubmission,
    rationale: body.rationale as string,
    recommendationId,
    manualFallbackReason,
  })
  ctx.setStatus(admitted.is_duplicate ? 200 : 201)
  ctx.json(admitted)
})

app
  .route('/api/v1/copyright-email-intakes/:id/correspondence-rejections')
  .post(async (ctx: Context) => {
    apiRequestContract<
      'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
      CopyrightEmailCorrespondenceRejectionRequest
    >('POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections')
    const { currentUser, intakeId, body } = await parseCopyrightReviewRequest(
      ctx,
      'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
    )
    const kinds = [
      'supplement',
      'appeal',
      'counter_notice',
      'withdrawal',
      'court_or_ccb_hold',
      'complaint',
    ] as const
    ctx.assert(
      kinds.includes(body.kind as (typeof kinds)[number]),
      422,
      'Invalid correspondence kind',
    )
    const recommendationId = parseCopyrightRecommendationId(body)
    const manualFallbackReason = parseCopyrightManualFallbackReason(body)
    validateRequestContract(
      ctx,
      'POST:/api/v1/copyright-email-intakes/:id/correspondence-rejections',
      { path: ctx.params, body },
    )
    const rejected = await rejectCopyrightEmailCorrespondenceDecision({
      currentUser,
      intakeId,
      kind: body.kind as (typeof kinds)[number],
      rationale: body.rationale as string,
      recommendationId,
      manualFallbackReason,
    })
    ctx.setStatus(rejected.is_duplicate ? 200 : 201)
    ctx.json(rejected)
  })
