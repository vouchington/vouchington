import { parseStaffClearanceDecision } from '@services/post-clearance/parse-staff-decision'
import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { updateClearanceStatus } from '@services/post-clearance'
import { isModerationStaff } from '@services/users'
import app from '../../../app.mts'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'

app.route('/api/v1/posts/:idOrSlug/clearances').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isModerationStaff,
    'POST:/api/v1/posts/:idOrSlug/clearances',
  )

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const body = parseStaffClearanceDecision(await ctx.request.json('8kb'))
  validateRequestContract(ctx, 'POST:/api/v1/posts/:idOrSlug/clearances', {
    body,
    path: ctx.params,
  })

  await updateClearanceStatus(post.id, body.status, currentUser.id, 'staff_or_user', {
    reasonCode: body.reason_code,
    privateNote: body.private_note,
    platformOverride: true,
  })

  ctx.json({ clearance_status: body.status })
})
