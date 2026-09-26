import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { updateClearanceStatus, type ClearanceStatus } from '@services/post-clearance'
import { isModerationStaff } from '@services/users'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

type ClearanceMutationBody = {
  status: ClearanceStatus
  reason_code: string
  private_note?: string
}

const clearanceStatuses: readonly ClearanceStatus[] = [
  'approved',
  'rejected',
  'in_review',
  'pending',
]

app.route('/api/v1/posts/:idOrSlug/clearances').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isModerationStaff,
    'POST:/api/v1/posts/:idOrSlug/clearances',
  )

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const body = (await ctx.request.json('8kb')) as ClearanceMutationBody
  validateRequestContract(ctx, 'POST:/api/v1/posts/:idOrSlug/clearances', {
    body,
    path: ctx.params,
  })
  ctx.assert(clearanceStatuses.includes(body.status), 422, 'Invalid status')
  ctx.assert(
    /^[a-z][a-z0-9_]{0,99}$/.test(body.reason_code),
    422,
    'reason_code must be a stable identifier',
  )
  ctx.assert(
    body.private_note === undefined ||
      (body.private_note.trim() === body.private_note && body.private_note.length <= 4000),
    422,
    'private_note must be trimmed and at most 4000 characters',
  )

  await updateClearanceStatus(post.id, body.status, currentUser.id, {
    reasonCode: body.reason_code,
    privateNote: body.private_note,
    platformOverride: true,
  })

  ctx.json({ clearance_status: body.status })
})
