import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import {
  currentUserCanGrantMembership,
  grantMembership,
  InvalidMembershipGrantSkuError,
  InvalidMembershipGrantUserError,
} from '@services/memberships'
import type { MembershipPlanSlug } from '@services/memberships/types'
import { assertNotSuspended } from '@services/users'

const VALID_PLANS = new Set<string>(['plus', 'pro'])

app.route('/api/v1/membership-grants').post(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanGrantMembership,
    'POST:/api/v1/membership-grants',
  )
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('1mb')) as {
    user_id: string
    plan: string
    sku_id: string
    duration_days: number
  }
  if (body === null) ctx.throw(400, 'Missing user_id')

  ctx.assert(body.user_id && typeof body.user_id === 'string', 400, 'Missing user_id')
  ctx.assert(body.plan && VALID_PLANS.has(body.plan), 400, 'Invalid plan')
  ctx.assert(body.sku_id && typeof body.sku_id === 'string', 400, 'Missing sku_id')
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
      body.plan as MembershipPlanSlug,
      body.sku_id,
      body.duration_days,
    )
  } catch (error) {
    if (error instanceof InvalidMembershipGrantSkuError) ctx.throw(400, 'Invalid sku_id')
    if (error instanceof InvalidMembershipGrantUserError) ctx.throw(400, 'Invalid user_id')
    if (error instanceof Error && 'code' in error && (error as { code: string }).code === '23503') {
      ctx.throw(400, 'Invalid user_id')
    }
    throw error
  }

  ctx.setStatus(201)
  ctx.json(
    result.queued
      ? { membership: null, grant: { id: result.grantId }, queued: true as const }
      : { membership: { id: result.id }, grant: { id: result.grantId }, queued: false as const },
  )
})
