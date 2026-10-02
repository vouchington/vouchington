import {
  parseStaffClearanceDecision,
  type StaffClearanceDecision,
} from '@services/post-clearance/parse-staff-decision'
import type { Context } from '@jongleberry/api-server'
import { getPostByAnyCached } from '@services/entity-fetch'
import { updateClearanceStatus } from '@services/post-clearance'
import { isModerationStaff } from '@services/users'
import app from '../../../app.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
} from '../../../response-helpers.mts'

app.route('/api/v1/posts/:idOrSlug/clearances').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    isModerationStaff,
    'POST:/api/v1/posts/:idOrSlug/clearances',
  )

  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const body = await parseJsonBody<StaffClearanceDecision>(ctx, '8kb')
  validateRequestContract(ctx, 'POST:/api/v1/posts/:idOrSlug/clearances', {
    body,
    path: ctx.params,
  })

  const decision = parseStaffClearanceDecision(body)
  await updateClearanceStatus(post.id, decision.status, currentUser.id, 'staff_or_user', {
    reasonCode: decision.reason_code,
    privateNote: decision.private_note,
    platformOverride: true,
  })

  ctx.json({ clearance_status: decision.status })
})
