import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  parseJsonBody,
  requireAuthAndRateLimit,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { adminSetVoteWeight, adminClearVoteWeight } from '@services/vote-weight/admin-set'
import { currentUserCanSetVoteWeight } from '@services/vote-weight/authorization'
import { enqueueRecalculateUserVoteWeight } from '@queues/vote-aggregation/enqueues/vote-weight'

type SetVoteWeightRequest = { weight: number }

app
  .route('/api/v1/users/:userId/vote-weight')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => currentUserCanSetVoteWeight(user),
      'PUT:/api/v1/users/:userId/vote-weight',
    )

    const userId = validateUUIDParam(ctx, 'userId')
    const body = (await parseJsonBody(ctx, '1kb')) as SetVoteWeightRequest
    validateRequestContract(ctx, 'PUT:/api/v1/users/:userId/vote-weight', {
      body,
      path: ctx.params,
    })
    const { weight } = body
    ctx.assert(weight >= 0 && weight <= 1_000_000, 400, 'Invalid weight value')

    await adminSetVoteWeight(currentUser.id, userId, weight)
    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => currentUserCanSetVoteWeight(user),
      'DELETE:/api/v1/users/:userId/vote-weight',
    )

    const userId = validateUUIDParam(ctx, 'userId')
    validateRequestContract(ctx, 'DELETE:/api/v1/users/:userId/vote-weight', { path: ctx.params })
    await adminClearVoteWeight(currentUser.id, userId)
    await enqueueRecalculateUserVoteWeight(userId, true)
    ctx.setStatus(204)
  })
