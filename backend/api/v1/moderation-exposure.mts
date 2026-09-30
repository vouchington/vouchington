import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody, validateRequestContract } from '../response-helpers.mts'
import type { ApiUuidContract } from '../request-contract-types.mts'
import { apiResponse } from '../response-contract.mts'
import {
  recordMediaRevealAndGetExposureState,
  getExposureState,
  currentUserCanRecordReveal,
  type ModMediaRevealSurface,
} from '@services/moderation-exposure'

interface RecordModerationRevealRequest {
  postId?: ApiUuidContract | null
  reportId?: ApiUuidContract | null
  surface: ModMediaRevealSurface
}

app.route('/api/v1/moderation/reveals').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/moderation/reveals')
  if (!currentUserCanRecordReveal(currentUser)) {
    ctx.throw(403, 'Forbidden')
  }

  const body = await parseJsonBody<RecordModerationRevealRequest>(ctx)
  validateRequestContract(ctx, 'POST:/api/v1/moderation/reveals', { body })

  const state = await recordMediaRevealAndGetExposureState(currentUser.id, {
    postId: body.postId ?? null,
    reportId: body.reportId ?? null,
    surface: body.surface,
  })
  ctx.json(apiResponse('POST:/api/v1/moderation/reveals', { exposure: state }))
})

app.route('/api/v1/moderation/exposure').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/moderation/exposure')
  const state = await getExposureState(currentUser.id)
  ctx.json(apiResponse('GET:/api/v1/moderation/exposure', { exposure: state }))
})
