import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  rollbackClassifierCandidateThreshold,
  setClassifierCandidateThreshold,
  type ClassifierThresholdChangeResult,
  type ClassifierThresholdRevision,
} from '@services/classifiers'
import { assertNotSuspended, isAdminUser } from '@services/users'
import {
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../../response-helpers.mts'
import { apiResponse } from '../../../response-contract.mts'
import type { ApiUuidContract } from '../../../request-contract-types.mts'

type SetClassifierCandidateThresholdRequest = {
  /** The lower bound for this candidate; `null` inherits the prompt version default. */
  lower_threshold_override: number | null
  /** The upper bound for this candidate; `null` inherits the prompt version default. */
  upper_threshold_override: number | null
}

type RollbackClassifierCandidateThresholdRequest = {
  /** A revision of this candidate for the classifier's active prompt version. */
  revision_id: ApiUuidContract
}

type AppliedThresholdChange = { threshold: ClassifierThresholdRevision; changed: boolean }

// PUT /api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold — set (or, with
// both bounds null, clear) a candidate's override for the active prompt version
app
  .route('/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      isAdminUser,
      'PUT:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold',
    )
    assertNotSuspended(currentUser)
    const classifierId = validateUUIDParam(ctx, 'classifierId')
    const candidateId = validateUUIDParam(ctx, 'candidateId')
    const body = (await ctx.request.json('10kb')) as SetClassifierCandidateThresholdRequest
    validateRequestContract(
      ctx,
      'PUT:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold',
      { path: ctx.params, body },
    )
    const result = await setClassifierCandidateThreshold(
      currentUser.id,
      { classifierId, candidateId },
      { lower: body.lower_threshold_override, upper: body.upper_threshold_override },
    )
    ctx.json(
      apiResponse(
        'PUT:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold',
        appliedChange(ctx, result),
      ),
    )
  })

// POST /api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold/rollback —
// re-apply an earlier revision's values as a new revision
app
  .route('/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold/rollback')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      isAdminUser,
      'POST:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold/rollback',
    )
    assertNotSuspended(currentUser)
    const classifierId = validateUUIDParam(ctx, 'classifierId')
    const candidateId = validateUUIDParam(ctx, 'candidateId')
    const body = (await ctx.request.json('10kb')) as RollbackClassifierCandidateThresholdRequest
    validateRequestContract(
      ctx,
      'POST:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold/rollback',
      { path: ctx.params, body },
    )
    const result = await rollbackClassifierCandidateThreshold(
      currentUser.id,
      { classifierId, candidateId },
      body.revision_id,
    )
    ctx.json(
      apiResponse(
        'POST:/api/v1/admin/classifiers/:classifierId/candidates/:candidateId/threshold/rollback',
        appliedChange(ctx, result),
      ),
    )
  })

/** Maps every refusal to its HTTP status; only an applied or already-in-force change passes. */
function appliedChange(
  ctx: Context,
  result: ClassifierThresholdChangeResult,
): AppliedThresholdChange {
  if (result.outcome === 'not_found') ctx.throw(404, 'Classifier threshold target not found')
  if (result.outcome === 'invalid') ctx.throw(422, result.reason)
  if (result.outcome === 'conflict') ctx.throw(409, result.reason)
  return { threshold: result.threshold, changed: result.outcome === 'changed' }
}
