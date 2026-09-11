import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../../response-helpers.mts'
import { restoreAside } from '@services/aside-preferences'

// DELETE /api/v1/my/aside-preferences/:asideKey
app.route('/api/v1/my/aside-preferences/:asideKey').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/aside-preferences/:asideKey')

  const asideKey = ctx.params.asideKey
  ctx.assert(
    typeof asideKey === 'string' && asideKey.trim().length > 0,
    400,
    'asideKey is required',
  )

  await restoreAside(currentUser.id, asideKey.trim())
  ctx.setStatus(204)
})
