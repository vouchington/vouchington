import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import {
  currentUserCanGrantMembership,
  grantMembership,
  InvalidMembershipGrantSkuError,
  InvalidMembershipGrantUserError,
} from '@services/memberships'
import { assertNotSuspended } from '@services/users'

type GrantMembershipRequest = {
  user_id: ApiUuidContract
  plan: 'plus' | 'pro'
  sku_id: ApiUuidContract
  duration_days: number
}

app.route('/api/v1/membership-grants').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanGrantMembership,
    'POST:/api/v1/membership-grants',
  )
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('1mb')) as GrantMembershipRequest
  validateRequestContract(ctx, 'POST:/api/v1/membership-grants', { body })

  ctx.assert(
    Number.isInteger(body.duration_days) && body.duration_days >= 1 && body.duration_days <= 3660,
    400,
    'Invalid duration_days',
  )
  let result
  try {
    result = await grantMembership(
      currentUser.id,
      body.user_id,
      body.plan,
      body.sku_id,
      body.duration_days,
    )
  } catch (err) {
    if (err instanceof InvalidMembershipGrantSkuError) ctx.throw(400, 'Invalid sku_id')
    if (err instanceof InvalidMembershipGrantUserError) ctx.throw(400, 'Invalid user_id')
    if (err instanceof Error && 'code' in err && (err as { code: string }).code === '23503') {
      ctx.throw(400, 'Invalid user_id')
    }
    throw err
  }

  ctx.setStatus(201)
  ctx.json(
    result.queued
      ? { membership: null, grant: { id: result.grantId }, queued: true as const }
      : { membership: { id: result.id }, grant: { id: result.grantId }, queued: false as const },
  )
})
