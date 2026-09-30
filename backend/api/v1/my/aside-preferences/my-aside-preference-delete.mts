import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { restoreAside } from '@services/aside-preferences'

// DELETE /api/v1/my/aside-preferences/:asideKey
app.route('/api/v1/my/aside-preferences/:asideKey').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/aside-preferences/:asideKey')
  validateRequestContract(ctx, 'DELETE:/api/v1/my/aside-preferences/:asideKey', {
    path: ctx.params,
  })

  const asideKey = ctx.params.asideKey!.trim()
  ctx.assert(asideKey.length > 0, 400, 'asideKey is required')

  await restoreAside(currentUser.id, asideKey)
  ctx.setStatus(204)
})
