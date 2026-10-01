import './index-routes/images-by-imageid-state-stream-get.mts'

import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { validateUUIDParam, requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { completeImageUpload } from '@services/images/complete-upload'
import { getImageUploadState, deriveUploadStatus } from '@services/images/get-upload-state'
import { assertNotSuspended } from '@services/users'

type CreateImageUploadUrlRequest = { content_type: string; content_length: number }

// POST /api/v1/images/upload-url
app.route('/api/v1/images/upload-url').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/images/upload-url')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('1kb')) as CreateImageUploadUrlRequest
  validateRequestContract(ctx, 'POST:/api/v1/images/upload-url', { body })

  const result = await createImageUploadUrl(currentUser, {
    contentType: body.content_type,
    contentLength: body.content_length,
  })

  ctx.setStatus(201)
  ctx.json({ upload: result })
})

// POST /api/v1/images/:id/completions
app.route('/api/v1/images/:id/completions').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/images/:id/completions')

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'POST:/api/v1/images/:id/completions', { path: ctx.params })

  const image = await completeImageUpload(currentUser, id)

  ctx.json({ image: toCompleteImageUploadResponse(image) })
})

// GET /api/v1/images/:id/upload-state
// Polled by the frontend after POST /completions until upload reaches a
// terminal state (`ready`, `blocked`, or `failed`). Returns 404 if the
// image does not exist or the caller is not the owner.
app.route('/api/v1/images/:id/upload-state').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/images/:id/upload-state')

  const id = validateUUIDParam(ctx, 'id')
  validateRequestContract(ctx, 'GET:/api/v1/images/:id/upload-state', { path: ctx.params })
  const upload_state = await getImageUploadState(currentUser.id, id)

  ctx.json({ upload_state })
})

type CompleteImageUploadResponse = {
  id: string
  upload_status: ReturnType<typeof deriveUploadStatus>
}

function toCompleteImageUploadResponse(image: {
  id: string
  upload_started_at: Date | null
  upload_completed_at: Date | null
  upload_failed_at: Date | null
}): CompleteImageUploadResponse {
  return {
    id: image.id,
    upload_status: deriveUploadStatus(image),
  }
}
