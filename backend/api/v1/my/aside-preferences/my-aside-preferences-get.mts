import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../../response-helpers.mts'
import { listAsidePreferences } from '@services/aside-preferences'

// GET /api/v1/my/aside-preferences
app.route('/api/v1/my/aside-preferences').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/aside-preferences')

  const aside_preferences = await listAsidePreferences(currentUser.id)
  ctx.json({ aside_preferences })
})
