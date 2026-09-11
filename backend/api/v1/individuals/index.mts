import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth } from '../../response-helpers.mts'
import { getOrCreateIndividual } from '@services/individuals-households'

app.route('/api/v1/me/individual').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/me/individual')
  const individual = await getOrCreateIndividual(currentUser)
  ctx.json({ individual })
})
