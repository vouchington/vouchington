import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { adminSetVoteWeight, adminClearVoteWeight } from '@services/vote-weight/admin-set'
import { currentUserCanSetVoteWeight } from '@services/vote-weight/authorization'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-weight/enqueues'

app
  .route('/api/v1/users/:userId/vote-weight')
  .put(async (ctx: Context) => {
    await requireAuthAndRateLimit(
      ctx,
      user => currentUserCanSetVoteWeight(user),
      'PUT:/api/v1/users/:userId/vote-weight',
    )

    const userId = ctx.params.userId!
    const body = (await ctx.request.json('1kb')) as Record<string, unknown>
    const { weight } = body
    ctx.assert(
      typeof weight === 'number' && weight >= 0 && weight <= 1_000_000,
      400,
      'Invalid weight value',
    )

    await adminSetVoteWeight(userId, weight)
    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    await requireAuthAndRateLimit(
      ctx,
      user => currentUserCanSetVoteWeight(user),
      'DELETE:/api/v1/users/:userId/vote-weight',
    )

    const userId = ctx.params.userId!
    await adminClearVoteWeight(userId)
    enqueueRecalculateUserVoteWeight(userId, true)
    ctx.setStatus(204)
  })
