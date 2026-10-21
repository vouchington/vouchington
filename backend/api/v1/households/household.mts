import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  readMyHousehold,
  deleteMyHousehold,
} from '@services/individuals-households/households/household-commands'

app
  .route('/api/v1/households/:id')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/households/:id')
    ctx.json(
      await readMyHousehold(currentUser, ctx.params, input =>
        validateRequestContract(ctx, 'GET:/api/v1/households/:id', input),
      ),
    )
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/households/:id')
    await deleteMyHousehold(currentUser, ctx.params, input =>
      validateRequestContract(ctx, 'DELETE:/api/v1/households/:id', input),
    )
    ctx.setStatus(204)
  })
