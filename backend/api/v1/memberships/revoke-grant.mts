import type { Context } from '@jongleberry/api-server'
import {
  CompletedMembershipGrantError,
  currentUserCanGrantMembership,
  revokeMembershipGrant,
} from '@services/memberships'
import { assertNotSuspended } from '@services/users'
import app from '../../app.mts'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateUUIDParam,
} from '../../response-helpers.mts'

app.route('/api/v1/membership-grants/:grantId').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanGrantMembership,
    'DELETE:/api/v1/membership-grants/:grantId',
  )
  assertNotSuspended(currentUser)
  const grantId = validateUUIDParam(ctx, 'grantId')
  const body = await parseJsonBody<{ reason: string }>(ctx)
  ctx.assert(
    typeof body?.reason === 'string' &&
      body.reason.trim().length >= 1 &&
      body.reason.trim().length <= 1000,
    400,
    'Invalid reason',
  )

  let result
  try {
    result = await revokeMembershipGrant(currentUser.id, grantId, body.reason.trim())
  } catch (error) {
    if (error instanceof CompletedMembershipGrantError)
      ctx.throw(409, 'Completed membership grants cannot be revoked')
    throw error
  }
  ctx.assert(result, 404, 'Membership grant not found')
  ctx.setStatus(204)
})
