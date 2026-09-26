import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract, validateUUIDParam } from '../../response-helpers.mts'
import { markRead, markUnread } from '@services/read-states'
import { getRssFeedItemById } from '@services/rss-feed-items/get'

app
  .route('/api/v1/rss-feed-items/:id/read')
  .put(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'PUT:/api/v1/rss-feed-items/:id/read')
    validateRequestContract(ctx, 'PUT:/api/v1/rss-feed-items/:id/read', { path: ctx.params })
    const id = validateUUIDParam(ctx, 'id')
    const item = await getRssFeedItemById(id)
    ctx.assert(item, 404, 'RSS feed item not found')
    await markRead(currentUser.id, 'rss_feed_item', id)
    ctx.setStatus(204)
  })
  .delete(async (ctx: Context) => {
    const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/rss-feed-items/:id/read')
    validateRequestContract(ctx, 'DELETE:/api/v1/rss-feed-items/:id/read', { path: ctx.params })
    const id = validateUUIDParam(ctx, 'id')
    const item = await getRssFeedItemById(id)
    ctx.assert(item, 404, 'RSS feed item not found')
    await markUnread(currentUser.id, 'rss_feed_item', id)
    ctx.setStatus(204)
  })
