import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../../response-helpers.mts'
import { dismissAside } from '@services/aside-preferences'

type DismissAsideRequest = { aside_key: string }

// POST /api/v1/my/aside-preferences
app.route('/api/v1/my/aside-preferences').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/aside-preferences')

  const body = (await ctx.request.json('10kb')) as DismissAsideRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/aside-preferences', { body })
  const asideKey = body.aside_key.trim()
  ctx.assert(asideKey.length > 0, 400, 'aside_key is required')
  ctx.assert(asideKey.length <= 100, 422, 'aside_key must be 100 characters or fewer')

  await dismissAside(currentUser.id, asideKey)
  ctx.setStatus(204)
})
