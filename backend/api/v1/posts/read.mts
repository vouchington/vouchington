import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { markRead, markUnread } from '@services/read-states'
import { assertPostReadStateTarget } from '@services/posts/read-state-target'

app
  .route('/api/v1/posts/:id/read')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PUT:/api/v1/posts/:id/read')
    validateRequestContract(ctx, 'PUT:/api/v1/posts/:id/read', { path: ctx.params })
    const id = validateUUIDParam(ctx, 'id')
    await assertPostReadStateTarget(currentUser, id)
    await markRead(currentUser.id, 'post', id)
    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/posts/:id/read')
    validateRequestContract(ctx, 'DELETE:/api/v1/posts/:id/read', { path: ctx.params })
    const id = validateUUIDParam(ctx, 'id')
    await assertPostReadStateTarget(currentUser, id)
    await markUnread(currentUser.id, 'post', id)
    ctx.setStatus(204)
  })
