import { isAdminUser } from '@services/users'
import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import {
  searchRssFeedItems,
  proxyThumbnailUrls,
  getRssFeedItemEmbedsByItems,
} from '@services/rss-feed-items'
import { proxyRssFeedItemCoverArt } from '@services/rss-feed-items/proxy-cover-art'
import { sanitizeRssFeedItemContentHtmlBatch } from '@services/rss-feed-items/sanitize-content-html'
import { searchRssFeedItemsCached } from '@services/entity-fetch/search-caches'
import {
  getPostByAnyCachedBatch,
  getPostMetricsByAnyCachedBatch,
  getRssFeedItemByIdCachedBatch,
  getRssFeedItemElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getRssFeedItemElectionVotesByUser } from '@services/elections-votes/rss-feed-item'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { indexById } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import {
  parseRssFeedItemsSearchParams,
  prepareRssFeedItemsSearchParams,
  resolveRssFeedItemsSearchParams,
} from '@services/search-params'
import { getPostIdsByUrlIds } from '@services/posts/search/get-posts-by-url-ids'
import { clampAnonLimit } from '@modules/search-utils'
import {
  getStoriesByIdBatch,
  getItemIdsByStoryIds,
  getVisiblePostStoryIdsByStoryIds,
} from '@services/stories'
import { sendHashtagTopicSearchErrorResponse } from '../hashtag-search-error-response.mts'
import { apiQuery } from '../../response-contract.mts'

app.route('/api/v1/rss-feed-items').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/rss-feed-items', parseRssFeedItemsSearchParams)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/rss-feed-items')
  const preparedSearchParams = prepareRssFeedItemsSearchParams(ctx.query)
  validateRequestContract(ctx, 'GET:/api/v1/rss-feed-items', {
    query: preparedSearchParams.validationQuery,
  })
  const parsedSearchParams = await resolveRssFeedItemsSearchParams(preparedSearchParams).catch(
    error => sendHashtagTopicSearchErrorResponse(ctx, error),
  )
  if (!parsedSearchParams) return
  const { shouldReturnEmpty, searchOptions } = parsedSearchParams
  if (!currentUser) searchOptions.limit = clampAnonLimit(searchOptions.limit)

  if (shouldReturnEmpty) {
    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    const output: Record<string, unknown> = {
      results: [],
      page_info: {
        has_next_page: false,
        end_cursor: null,
        start_cursor: null,
      },
      rss_feed_items: {},
      rss_feed_item_elections: {},
      rss_feed_item_content_html: {},
      rss_feed_item_thumbnail_url: {},
      rss_feed_item_embeds: {},
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
    return
  }

  const searchResult = currentUser
    ? await searchRssFeedItems({
        ...searchOptions,
        currentUserId: currentUser.id,
        isAdministrator: isAdminUser(currentUser),
      })
    : await searchRssFeedItemsCached(searchOptions)
  const itemIds = searchResult.results.map(result => result.id)
  const storyIds = [
    ...new Set(searchResult.results.flatMap(r => (r.story_id ? [r.story_id as string] : []))),
  ]
  const [storyMemberIdsMap, storyPostIdsMap] =
    storyIds.length > 0
      ? await Promise.all([
          getItemIdsByStoryIds(storyIds),
          getVisiblePostStoryIdsByStoryIds(currentUser, storyIds),
        ])
      : [{}, {}]
  const storyMemberItemIds = Object.values(storyMemberIdsMap).flat()
  const allItemIds = [...new Set([...itemIds, ...storyMemberItemIds])]

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  // Use streaming pattern: pass promises directly to allow independent streaming
  const itemsPromise = getRssFeedItemByIdCachedBatch(allItemIds)
  const electionsPromise = getRssFeedItemElectionByIdCachedBatch(allItemIds).then(indexById)

  const output: Record<string, unknown> = {
    results: searchResult.results,
    page_info: searchResult.page_info,
    rss_feed_items: itemsPromise.then(items =>
      indexById(items.map(item => (item == null ? item : proxyRssFeedItemCoverArt(item)))),
    ),
    rss_feed_item_elections: electionsPromise,
    rss_feed_item_content_html: itemsPromise.then(items =>
      sanitizeRssFeedItemContentHtmlBatch(
        items.filter((item): item is NonNullable<typeof item> => item != null),
      ),
    ),
    rss_feed_item_thumbnail_url: itemsPromise.then(items =>
      proxyThumbnailUrls(items.filter((item): item is NonNullable<typeof item> => item != null)),
    ),
    rss_feed_item_embeds: itemsPromise.then(items =>
      getRssFeedItemEmbedsByItems(
        items.filter((item): item is NonNullable<typeof item> => item != null),
        {},
        isAdminUser(currentUser) ? 'administrator' : 'public',
      ),
    ),
    stories: storyIds.length > 0 ? getStoriesByIdBatch(storyIds).then(indexById) : {},
    story_member_ids: storyMemberIdsMap,
    story_post_ids: storyPostIdsMap,
  }

  if (currentUser) {
    // Look up related discussion posts by URL IDs from RSS feed items
    const relatedPostsPromise = itemsPromise.then(async items => {
      const urlIds = [...new Set(items.flatMap(item => (item?.url?.id ? [item.url.id] : [])))]
      const storyPostIdValues = Object.values(storyPostIdsMap)
      if (urlIds.length === 0) return { related_posts_by_url_id: {}, postIds: storyPostIdValues }
      const related_posts_by_url_id = await getPostIdsByUrlIds(currentUser, urlIds)
      const postIds = [
        ...new Set([...Object.values(related_posts_by_url_id).flat(), ...storyPostIdValues]),
      ]
      return { related_posts_by_url_id, postIds }
    })

    output.related_posts_by_url_id = relatedPostsPromise.then(r => r.related_posts_by_url_id)
    output.posts = relatedPostsPromise.then(r =>
      r.postIds.length > 0 ? getPostByAnyCachedBatch(r.postIds).then(indexById) : {},
    )
    output.posts_metrics = relatedPostsPromise.then(r =>
      r.postIds.length > 0 ? getPostMetricsByAnyCachedBatch(r.postIds).then(indexById) : {},
    )

    output.bookmarks = itemsPromise.then(async items => {
      const fetchedItemIds = items.flatMap(item => (item != null ? [item.id] : []))
      if (fetchedItemIds.length === 0) return {}
      const bookmarks = await getBookmarksForEntities(currentUser, 'rss_feed_item', fetchedItemIds)
      return bookmarks
    })

    output.election_votes = itemsPromise.then(async items => {
      const votableItemIds = items.flatMap(item => (item != null ? [item.id] : []))
      if (votableItemIds.length === 0) return {}

      const votes = await getRssFeedItemElectionVotesByUser(currentUser.id, votableItemIds)
      const votesMap = new Map(votes.map(vote => [vote.entity_id, vote]))
      return electionVotesMapToRecord(votesMap)
    })

    output.rss_feed_bookmarks = itemsPromise.then(async items => {
      const feedIds = [...new Set(items.flatMap(item => (item != null ? [item.rss_feed.id] : [])))]
      if (feedIds.length === 0) return {}
      const bookmarks = await getBookmarksForEntities(currentUser, 'rss_feed', feedIds)
      return Object.keys(bookmarks).length > 0 ? bookmarks : {}
    })
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
