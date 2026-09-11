import './index-routes/images-by-imageid-state-stream-get.mts'

import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { validateUUIDParam, requireAuth } from '../../response-helpers.mts'
import { createImageUploadUrl } from '@services/images/create-upload-url'
import { completeImageUpload } from '@services/images/complete-upload'
import { getImageUploadState, deriveUploadStatus } from '@services/images/get-upload-state'
import { assertNotSuspended } from '@services/users'

// POST /api/v1/images/upload-url
app.route('/api/v1/images/upload-url').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/images/upload-url')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('1kb')) as Record<string, unknown>

  ctx.assert(body.content_type, 400, 'content_type is required')
  ctx.assert(body.content_length, 400, 'content_length is required')
  ctx.assert(typeof body.content_length === 'number', 400, 'content_length must be a number')

  const result = await createImageUploadUrl(currentUser, {
    contentType: body.content_type as string,
    contentLength: body.content_length as number,
  })

  ctx.setStatus(201)
  ctx.json({ upload: result })
})

// POST /api/v1/images/:id/completions
app.route('/api/v1/images/:id/completions').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/images/:id/completions')

  const id = ctx.params.id!
  ctx.assert(id, 400, 'Image ID is required')

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
