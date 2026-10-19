import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { getHousehold, deleteHousehold } from '@services/individuals-households'

app
  .route('/api/v1/households/:id')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/households/:id')
    validateUUIDParam(ctx, 'id')
    validateRequestContract(ctx, 'GET:/api/v1/households/:id', { path: ctx.params })
    const household = await getHousehold(currentUser, ctx.params.id!)
    ctx.json({ household })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/households/:id')
    validateUUIDParam(ctx, 'id')
    validateRequestContract(ctx, 'DELETE:/api/v1/households/:id', { path: ctx.params })
    await deleteHousehold(currentUser, ctx.params.id!)
    ctx.setStatus(204)
  })
