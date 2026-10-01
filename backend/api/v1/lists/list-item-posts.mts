import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import { addListItem, getManageableList, removeListItem } from '@services/lists'
import { assertNotSuspended } from '@services/users'

type AddListPostBody = { post_id: ApiUuidContract }

app.route('/api/v1/lists/:id/items/posts').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/lists/:id/items/posts')
  assertNotSuspended(currentUser)
  const listId = validateUUIDParam(ctx, 'id')
  const list = await getManageableList(currentUser.id, listId)

  const body = (await ctx.request.json('1mb')) as AddListPostBody
  validateRequestContract(ctx, 'POST:/api/v1/lists/:id/items/posts', { path: ctx.params, body })

  const item = await addListItem(list.id, 'post', body.post_id)
  ctx.setStatus(201)
  ctx.json({ list_item: item })
})

app.route('/api/v1/lists/:id/items/posts/:entityId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/lists/:id/items/posts/:entityId')
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'DELETE:/api/v1/lists/:id/items/posts/:entityId', {
    path: ctx.params,
  })
  const listId = validateUUIDParam(ctx, 'id')
  const entityId = validateUUIDParam(ctx, 'entityId')
  const list = await getManageableList(currentUser.id, listId)

  await removeListItem(list.id, 'post', entityId)
  ctx.setStatus(204)
})
