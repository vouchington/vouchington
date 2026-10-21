import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { readMyIndividual } from '@services/individuals-households/households/household-commands'

app.route('/api/v1/me/individual').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/me/individual')
  ctx.json(
    await readMyIndividual(currentUser, input =>
      validateRequestContract(ctx, 'GET:/api/v1/me/individual', input),
    ),
  )
})
