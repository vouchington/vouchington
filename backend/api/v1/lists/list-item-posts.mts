import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateUUIDParam, parseJsonBody } from '../../response-helpers.mts'
import { isUUID } from '@modules/utils'
import {
  getListForWrite,
  addListItem,
  removeListItem,
  currentUserCanManageList,
} from '@services/lists'
import { assertNotSuspended } from '@services/users'

app.route('/api/v1/lists/:id/items/posts').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/lists/:id/items/posts')
  assertNotSuspended(currentUser)
  const listId = validateUUIDParam(ctx, 'id')
  const list = await getListForWrite(listId)
  ctx.assert(list, 404, 'List not found')
  ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

  const body = await parseJsonBody<{ post_id: string }>(ctx)
  ctx.assert(body?.post_id && isUUID(body.post_id), 422, 'post_id must be a valid UUID')

  const item = await addListItem(listId, 'post', body.post_id)
  ctx.setStatus(201)
  ctx.json({ list_item: item })
})

app.route('/api/v1/lists/:id/items/posts/:entityId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/lists/:id/items/posts/:entityId')
  assertNotSuspended(currentUser)
  const listId = validateUUIDParam(ctx, 'id')
  const entityId = validateUUIDParam(ctx, 'entityId')
  const list = await getListForWrite(listId)
  ctx.assert(list, 404, 'List not found')
  ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

  await removeListItem(listId, 'post', entityId)
  ctx.setStatus(204)
})
