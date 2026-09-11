import app from '../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, parseJsonBody } from '../response-helpers.mts'
import { isUUID } from '@modules/utils'
import { apiRequest, apiResponse } from '../response-contract.mts'
import {
  recordMediaRevealAndGetExposureState,
  getExposureState,
  currentUserCanRecordReveal,
  type ModMediaRevealSurface,
} from '@services/moderation-exposure'

const VALID_SURFACES = new Set<ModMediaRevealSurface>([
  'mod_queue',
  'review_queue',
  'reports',
  'post_page',
])

interface RecordModerationRevealRequest {
  postId?: string | null
  reportId?: string | null
  surface: ModMediaRevealSurface
}

app.route('/api/v1/moderation/reveals').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/moderation/reveals')
  if (!currentUserCanRecordReveal(currentUser)) {
    ctx.throw(403, 'Forbidden')
  }

  const rawBody = await parseJsonBody<Record<string, unknown>>(ctx)

  if (
    !rawBody ||
    typeof rawBody.surface !== 'string' ||
    !VALID_SURFACES.has(rawBody.surface as ModMediaRevealSurface)
  ) {
    ctx.throw(422, 'Invalid surface')
  }
  if (rawBody.postId != null && (typeof rawBody.postId !== 'string' || !isUUID(rawBody.postId))) {
    ctx.throw(422, 'Invalid postId')
  }
  if (
    rawBody.reportId != null &&
    (typeof rawBody.reportId !== 'string' || !isUUID(rawBody.reportId))
  ) {
    ctx.throw(422, 'Invalid reportId')
  }

  const validatedBody: RecordModerationRevealRequest = {
    postId: rawBody.postId ?? null,
    reportId: rawBody.reportId ?? null,
    surface: rawBody.surface as ModMediaRevealSurface,
  }
  const body = apiRequest('POST:/api/v1/moderation/reveals', validatedBody)

  const state = await recordMediaRevealAndGetExposureState(currentUser.id, body)
  ctx.json(apiResponse('POST:/api/v1/moderation/reveals', { exposure: state }))
})

app.route('/api/v1/moderation/exposure').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/moderation/exposure')
  const state = await getExposureState(currentUser.id)
  ctx.json(apiResponse('GET:/api/v1/moderation/exposure', { exposure: state }))
})
