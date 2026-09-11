import type { Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { requireAuth } from '../../response-helpers.mts'
import { apiNoRequestBody } from '../../response-contract.mts'
import { getHousehold, updateHousehold, deleteHousehold } from '@services/individuals-households'

app
  .route('/api/v1/households/:id')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'GET:/api/v1/households/:id')
    const household = await getHousehold(currentUser, ctx.params.id!)
    ctx.json({ household })
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/households/:id')
    // The body is read (to consume the request stream) but never used — apiNoRequestBody
    // suppresses the harvester's otherwise-spurious `unknown`-typed request body.
    apiNoRequestBody('PATCH:/api/v1/households/:id')
    await ctx.request.json('1mb')

    const household = await updateHousehold(currentUser, ctx.params.id!)
    ctx.json({ household })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/households/:id')
    await deleteHousehold(currentUser, ctx.params.id!)
    ctx.setStatus(204)
  })
