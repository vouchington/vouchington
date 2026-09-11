import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../../response-helpers.mts'
import { dismissAside } from '@services/aside-preferences'

// POST /api/v1/my/aside-preferences
app.route('/api/v1/my/aside-preferences').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/aside-preferences')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(
    typeof body.aside_key === 'string' && body.aside_key.trim().length > 0,
    400,
    'aside_key is required',
  )
  ctx.assert(
    (body.aside_key as string).trim().length <= 100,
    422,
    'aside_key must be 100 characters or fewer',
  )

  await dismissAside(currentUser.id, (body.aside_key as string).trim())
  ctx.setStatus(204)
})
