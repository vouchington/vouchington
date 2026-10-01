import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isAdminUser } from '@services/users'
import {
  addEditorialStoryItem,
  removeEditorialStoryItem,
  setEditorialStoryOfficialItem,
  renameEditorialStory,
} from '@services/stories'
import { requireAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import type { ApiUuidContract } from '../../../request-contract-types.mts'
type SetOfficialStoryItemRequest = { rss_feed_item_id: ApiUuidContract }
type UpdateStoryTitleRequest = { title: string }

app.route('/api/v1/stories/:storyId/items/:itemId').put(async (ctx: Context) => {
  const user = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'PUT:/api/v1/stories/:storyId/items/:itemId',
  )
  validateRequestContract(ctx, 'PUT:/api/v1/stories/:storyId/items/:itemId', { path: ctx.params })
  await addEditorialStoryItem(user, ctx.params.storyId!, ctx.params.itemId!)
  ctx.setStatus(204)
})
app.route('/api/v1/stories/:storyId/items/:itemId').delete(async (ctx: Context) => {
  const user = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'DELETE:/api/v1/stories/:storyId/items/:itemId',
  )
  validateRequestContract(ctx, 'DELETE:/api/v1/stories/:storyId/items/:itemId', {
    path: ctx.params,
  })
  await removeEditorialStoryItem(user, ctx.params.storyId!, ctx.params.itemId!)
  ctx.setStatus(204)
})
app.route('/api/v1/stories/:storyId/official').put(async (ctx: Context) => {
  const user = await requireAuthAndRateLimit(
    ctx,
    isAdminUser,
    'PUT:/api/v1/stories/:storyId/official',
  )
  const body = (await ctx.request.json('1mb')) as SetOfficialStoryItemRequest
  validateRequestContract(ctx, 'PUT:/api/v1/stories/:storyId/official', { path: ctx.params, body })
  ctx.json(await setEditorialStoryOfficialItem(user, ctx.params.storyId!, body.rss_feed_item_id!))
})
app.route('/api/v1/stories/:id').patch(async (ctx: Context) => {
  const user = await requireAuthAndRateLimit(ctx, isAdminUser, 'PATCH:/api/v1/stories/:id')
  const body = (await ctx.request.json('1mb')) as UpdateStoryTitleRequest
  validateRequestContract(ctx, 'PATCH:/api/v1/stories/:id', { path: ctx.params, body })
  ctx.json(await renameEditorialStory(user, ctx.params.id!, body.title!))
})
