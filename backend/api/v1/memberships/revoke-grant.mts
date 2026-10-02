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
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'

type RevokeMembershipGrantRequest = { reason: string }

app.route('/api/v1/membership-grants/:grantId').delete(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanGrantMembership,
    'DELETE:/api/v1/membership-grants/:grantId',
  )
  assertNotSuspended(currentUser)
  const grantId = validateUUIDParam(ctx, 'grantId')
  const body = await parseJsonBody<RevokeMembershipGrantRequest>(ctx)
  validateRequestContract(ctx, 'DELETE:/api/v1/membership-grants/:grantId', {
    body,
    path: ctx.params,
  })
  ctx.assert(
    body.reason.trim().length >= 1 && body.reason.trim().length <= 1000,
    400,
    'Invalid reason',
  )

  let result
  try {
    result = await revokeMembershipGrant(currentUser.id, grantId, body.reason.trim())
  } catch (err) {
    if (err instanceof CompletedMembershipGrantError)
      ctx.throw(409, 'Completed membership grants cannot be revoked')
    throw err
  }
  ctx.assert(result, 404, 'Membership grant not found')
  ctx.setStatus(204)
})
