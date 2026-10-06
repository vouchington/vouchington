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
  getManageableList,
  updateOwnedList,
  softDeleteList,
  currentUserCanViewList,
  type ListVisibility,
} from '@services/lists'
import { assertNotSuspended } from '@services/users'
import { attachListProvenance, attachWrittenListProvenance } from '@services/content-provenance'

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

    // The list came from the primary, so its provenance does too: a replica may not have it yet.
    const [labelled] = await attachListProvenance([list], currentUser, { readOnly: false })

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject({ list: labelled }))
  })
  .patch(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/lists/:id')
    assertNotSuspended(currentUser)
    const listId = validateUUIDParam(ctx, 'id')
    const list = await getManageableList(currentUser.id, listId)

    const body = (await ctx.request.json('1mb')) as UpdateListBody
    validateRequestContract(ctx, 'PATCH:/api/v1/lists/:id', { path: ctx.params, body })

    const updated = await updateOwnedList(currentUser.id, list, body)
    ctx.json({ list: await attachWrittenListProvenance(updated, currentUser) })
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/lists/:id')
    assertNotSuspended(currentUser)
    validateRequestContract(ctx, 'DELETE:/api/v1/lists/:id', { path: ctx.params })
    const listId = validateUUIDParam(ctx, 'id')
    const list = await getManageableList(currentUser.id, listId)

    await softDeleteList(currentUser.id, list.id)
    ctx.setStatus(204)
  })
