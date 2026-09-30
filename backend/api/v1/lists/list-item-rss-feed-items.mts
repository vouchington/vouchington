import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import type { ApiUuidContract } from '../../request-contract-types.mts'
import {
  getListForWrite,
  addListItem,
  removeListItem,
  currentUserCanManageList,
} from '@services/lists'
import { assertNotSuspended } from '@services/users'

type AddListRssFeedItemBody = { rss_feed_item_id: ApiUuidContract }

app.route('/api/v1/lists/:id/items/rss-feed-items').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/lists/:id/items/rss-feed-items')
  assertNotSuspended(currentUser)
  const listId = validateUUIDParam(ctx, 'id')
  const list = await getListForWrite(listId)
  ctx.assert(list, 404, 'List not found')
  ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

  const body = (await ctx.request.json('1mb')) as AddListRssFeedItemBody
  validateRequestContract(ctx, 'POST:/api/v1/lists/:id/items/rss-feed-items', {
    path: ctx.params,
    body,
  })

  const item = await addListItem(listId, 'rss_feed_item', body.rss_feed_item_id)
  ctx.setStatus(201)
  ctx.json({ list_item: item })
})

app.route('/api/v1/lists/:id/items/rss-feed-items/:entityId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/lists/:id/items/rss-feed-items/:entityId',
  )
  assertNotSuspended(currentUser)
  validateRequestContract(ctx, 'DELETE:/api/v1/lists/:id/items/rss-feed-items/:entityId', {
    path: ctx.params,
  })
  const listId = validateUUIDParam(ctx, 'id')
  const entityId = validateUUIDParam(ctx, 'entityId')
  const list = await getListForWrite(listId)
  ctx.assert(list, 404, 'List not found')
  ctx.assert(currentUserCanManageList(currentUser.id, list), 403, 'Forbidden')

  await removeListItem(listId, 'rss_feed_item', entityId)
  ctx.setStatus(204)
})
