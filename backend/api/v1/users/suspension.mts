import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { isAdminUser, suspendUser, unsuspendUser } from '@services/users'

app
  .route('/api/v1/users/:userId/suspension')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => isAdminUser(user),
      'PUT:/api/v1/users/:userId/suspension',
    )

    const body = (await ctx.request.json('1kb')) as Record<string, unknown>
    const reason = typeof body.reason === 'string' ? body.reason : undefined

    const user = await suspendUser(currentUser, ctx.params.userId!, reason)
    ctx.json({ user })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuthAndRateLimit(
      ctx,
      user => isAdminUser(user),
      'DELETE:/api/v1/users/:userId/suspension',
    )

    const user = await unsuspendUser(currentUser, ctx.params.userId!)
    ctx.json({ user })
  })
