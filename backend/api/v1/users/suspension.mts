import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { isAdminUser, suspendUser, unsuspendUser } from '@services/users'

type SuspendUserRequest = { reason?: string }

app
  .route('/api/v1/users/:userId/suspension')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => isAdminUser(user),
      'PUT:/api/v1/users/:userId/suspension',
    )

    const body = (await ctx.request.json('1kb')) as SuspendUserRequest
    validateRequestContract(ctx, 'PUT:/api/v1/users/:userId/suspension', {
      body,
      path: ctx.params,
    })

    const user = await suspendUser(currentUser, ctx.params.userId!, 'allow', body.reason)
    ctx.json({ user })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => isAdminUser(user),
      'DELETE:/api/v1/users/:userId/suspension',
    )
    validateRequestContract(ctx, 'DELETE:/api/v1/users/:userId/suspension', { path: ctx.params })

    const user = await unsuspendUser(currentUser, ctx.params.userId!)
    ctx.json({ user })
  })
