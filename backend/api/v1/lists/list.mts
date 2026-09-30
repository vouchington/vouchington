import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import {
  getOptionalAuthAndRateLimit,
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../response-helpers.mts'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import {
  getListForWrite,
  updateList,
  softDeleteList,
  currentUserCanManageList,
  currentUserCanViewList,
  type ListVisibility,
} from '@services/lists'
import { assertNotSuspended } from '@services/users'

type UpdateListBody = {
  name?: string
  description?: string | null
  visibility?: ListVisibility
}

app
  .route('/api/v1/lists/:id')
  .get(async (ctx: Context) => {
    const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/lists/:id')
    validateRequestContract(ctx, 'GET:/api/v1/lists/:id', { path: ctx.params })
    const listId = validateUUIDParam(ctx, 'id')
    const list = await getListForWrite(listId)
    const currentUserId = currentUser?.id ?? null
    ctx.assert(list && currentUserCanViewList(currentUserId, list), 404, 'List not found')

    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject({ list }))
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/lists/:id')
    assertNotSuspended(currentUser)
    const listId = validateUUIDParam(ctx, 'id')
    const list = await getListForWrite(listId)
    ctx.assert(list, 404, 'List not found')
    ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

    const body = (await ctx.request.json('1mb')) as UpdateListBody
    validateRequestContract(ctx, 'PATCH:/api/v1/lists/:id', { path: ctx.params, body })
    if (body.name !== undefined) {
      ctx.assert(body.name.length > 0, 422, 'name must be a non-empty string')
      ctx.assert(body.name.length <= 255, 422, 'name must be 255 characters or less')
    }

    const updated = await updateList(currentUser.id, listId, body)
    ctx.json({ list: updated })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/lists/:id')
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'DELETE:/api/v1/lists/:id', { path: ctx.params })
    const listId = validateUUIDParam(ctx, 'id')
    const list = await getListForWrite(listId)
    ctx.assert(list, 404, 'List not found')
    ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

    await softDeleteList(currentUser.id, listId)
    ctx.setStatus(204)
  })
