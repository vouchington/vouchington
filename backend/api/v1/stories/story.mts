import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit } from '../../response-helpers.mts'
import { getStoryItemIds, getStoryWithItemCount } from '@services/stories'
import {
  getRssFeedItemByIdCachedBatch,
  getRssFeedItemElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { indexById, isUUID } from '@modules/utils'
import { proxyRssFeedItemCoverArt } from '@services/rss-feed-items/proxy-cover-art'
import { getRssFeedItemEmbedsByItems } from '@services/rss-feed-items/get-rss-feed-item-embeds'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { isAdminUser } from '@services/users'

/**
 * GET /api/v1/stories/:id — Returns story with hydrated RSS feed items and elections.
 */
app.route('/api/v1/stories/:id').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/stories/:id')

  const storyId = ctx.params.id!
  ctx.assert(isUUID(storyId), 400, 'Invalid story ID')

  const story = await getStoryWithItemCount(storyId)
  ctx.assert(story, 404, 'Story not found')

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const itemIds = await getStoryItemIds(storyId)
  const electionsPromise = getRssFeedItemElectionByIdCachedBatch(itemIds).then(indexById)
  const rssFeedItemsPromise = getRssFeedItemByIdCachedBatch(itemIds).then(items =>
    items.flatMap(item => (item == null ? [] : [proxyRssFeedItemCoverArt(item)])),
  )

  const output: Record<string, unknown> = {
    story,
    rss_feed_items: rssFeedItemsPromise.then(indexById),
    rss_feed_item_embeds: rssFeedItemsPromise.then(items =>
      getRssFeedItemEmbedsByItems(items, {}, isAdminUser(currentUser) ? 'administrator' : 'public'),
    ),
    rss_feed_item_elections: electionsPromise,
    item_ids: itemIds,
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
