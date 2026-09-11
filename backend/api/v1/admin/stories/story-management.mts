import app from '../../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isAdminUser } from '@services/users'
import {
  getStoryById,
  getStoryItemIds,
  adminAssignItemToStory,
  adminRemoveItemFromStory,
  adminSetStoryOfficialItem,
  updateStoryTitle,
} from '@services/stories'
import { isUUID } from '@modules/utils'
import { requireAuthAndRateLimit } from '../../../response-helpers.mts'

/**
 * PUT /api/v1/stories/:storyId/items/:itemId — Admin: add item to story (locks assignment).
 */
app.route('/api/v1/stories/:storyId/items/:itemId').put(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'PUT:/api/v1/stories/:storyId/items/:itemId')

  const { storyId, itemId } = ctx.params
  ctx.assert(isUUID(storyId!), 400, 'Invalid story ID')
  ctx.assert(isUUID(itemId!), 400, 'Invalid item ID')

  const story = await getStoryById(storyId!)
  ctx.assert(story, 404, 'Story not found')

  const assigned = await adminAssignItemToStory(storyId!, itemId!)
  ctx.assert(assigned, 404, 'Item not found')

  ctx.setStatus(204)
})

/**
 * DELETE /api/v1/stories/:storyId/items/:itemId — Admin: remove item from story (locks assignment).
 */
app.route('/api/v1/stories/:storyId/items/:itemId').delete(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'DELETE:/api/v1/stories/:storyId/items/:itemId')

  const { storyId, itemId } = ctx.params
  ctx.assert(isUUID(storyId!), 400, 'Invalid story ID')
  ctx.assert(isUUID(itemId!), 400, 'Invalid item ID')

  const story = await getStoryById(storyId!)
  ctx.assert(story, 404, 'Story not found')

  const itemIds = await getStoryItemIds(storyId!)
  ctx.assert(itemIds.includes(itemId!), 400, 'Item is not in this story')

  const removed = await adminRemoveItemFromStory(itemId!)
  ctx.assert(removed, 404, 'Item not found')

  ctx.setStatus(204)
})

/**
 * PUT /api/v1/stories/:storyId/official — Admin: set official item (locks it).
 * Body: { rss_feed_item_id: string }
 */
app.route('/api/v1/stories/:storyId/official').put(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'PUT:/api/v1/stories/:storyId/official')

  const storyId = ctx.params.storyId!
  ctx.assert(isUUID(storyId), 400, 'Invalid story ID')

  const body = (await ctx.request.json('1mb')) as { rss_feed_item_id?: string }
  ctx.assert(
    body.rss_feed_item_id && isUUID(body.rss_feed_item_id),
    400,
    'Invalid rss_feed_item_id',
  )

  const story = await getStoryById(storyId)
  ctx.assert(story, 404, 'Story not found')

  const itemIds = await getStoryItemIds(storyId)
  ctx.assert(itemIds.includes(body.rss_feed_item_id!), 400, 'Item is not in this story')

  const updated = await adminSetStoryOfficialItem(storyId, body.rss_feed_item_id!)
  ctx.assert(updated, 404, 'Story not found')

  ctx.json({ story: updated })
})

/**
 * PATCH /api/v1/stories/:storyId — Admin: update story title.
 * Body: { title: string }
 */
app.route('/api/v1/stories/:storyId').patch(async (ctx: Context) => {
  await requireAuthAndRateLimit(ctx, isAdminUser, 'PATCH:/api/v1/stories/:storyId')

  const storyId = ctx.params.storyId!
  ctx.assert(isUUID(storyId), 400, 'Invalid story ID')

  const body = (await ctx.request.json('1mb')) as { title?: string }
  const title = typeof body.title === 'string' ? body.title.trim() : ''
  ctx.assert(title.length > 0, 400, 'title is required')
  ctx.assert(title.length <= 500, 400, 'title must be at most 500 characters')

  const updated = await updateStoryTitle(storyId, title)
  ctx.assert(updated, 404, 'Story not found')

  ctx.json({ story: updated })
})
