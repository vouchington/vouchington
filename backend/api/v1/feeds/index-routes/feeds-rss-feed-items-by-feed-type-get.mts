import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { indexById } from '@modules/utils'
import { proxyRssFeedItemCoverArt } from '@services/rss-feed-items/proxy-cover-art'
import { getRssFeedItemEmbedsByItems, proxyThumbnailUrls } from '@services/rss-feed-items'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getRssFeedItemElectionVotesByUser } from '@services/elections-votes/rss-feed-item'
import {
  getPostByAnyCachedBatch,
  getPostMetricsByAnyCachedBatch,
  getRssFeedItemByIdCachedBatch,
  getRssFeedItemElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { getRssFeedItemFeedIds } from '@services/feeds'
import { VALID_RSS_FEED_ITEM_FEED_TYPES, type RssFeedItemFeedType } from '@services/feeds/types'
import { maskAnonymousPosts } from '@services/posts'
import { getPostIdsByUrlIds } from '@services/posts/search/get-posts-by-url-ids'
import {
  getItemIdsByStoryIds,
  getVisiblePostStoryIdsByStoryIds,
  getStoriesByIdBatch,
} from '@services/stories'
import { getPublicUsersByAnyBatch } from '@services/users/get-public-batch'
import { isAdminUser } from '@services/users'
import { parseNumberParams } from '@ts-shared/utils/query'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'
import { sendHashtagTopicSearchErrorResponse } from '../../hashtag-search-error-response.mts'

import {
  loadOptionalFeedCommunityScope,
  parseHashtagFeedSearchOptions,
  rssFeedItemFeedParser,
} from './shared.mts'

app.route('/api/v1/feeds/rss_feed_items/:feed_type').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/feeds/rss_feed_items/:feed_type')

  const feedType = ctx.params.feed_type as RssFeedItemFeedType
  ctx.assert(
    VALID_RSS_FEED_ITEM_FEED_TYPES.includes(feedType),
    404,
    `Invalid feed_type. Must be one of: ${VALID_RSS_FEED_ITEM_FEED_TYPES.join(', ')}`,
  )

  // Parse pagination and common filters
  const paginationOptions = rssFeedItemFeedParser.parse(ctx.query)
  const hashtagSearchOptions = await parseHashtagFeedSearchOptions(ctx.query).catch(error =>
    sendHashtagTopicSearchErrorResponse(ctx, error),
  )
  if (!hashtagSearchOptions) return

  // Parse feed-specific parameters
  const communityParam = ctx.query.community as string | undefined
  const communityScope = await loadOptionalFeedCommunityScope(currentUser, feedType, communityParam)
  const has_related_posts =
    ctx.query.has_related_posts === 'true'
      ? true
      : ctx.query.has_related_posts === 'false'
        ? false
        : undefined

  const options = {
    ...paginationOptions,
    ...parseNumberParams(ctx.query, ['min_score_follow_rss_feeds', 'min_score_follow_topics']),
    ...hashtagSearchOptions,
    feed_type: feedType,
    community_id: communityScope?.community.id,
    ...(has_related_posts !== undefined && { has_related_posts }),
  }

  const result = await getRssFeedItemFeedIds(currentUser, options)
  const rssFeedItemIds = result.results.map(r => r.entity_id)

  // Collect unique story IDs, then batch-fetch story data and member IDs
  const storyIds = [
    ...new Set(result.results.flatMap(r => (r.story_id !== null ? [r.story_id] : []))),
  ]
  const [storiesArr, storyMemberIds, storyPostIds] = await Promise.all([
    getStoriesByIdBatch(storyIds),
    getItemIdsByStoryIds(storyIds),
    getVisiblePostStoryIdsByStoryIds(currentUser, storyIds),
  ])

  // Fetch story member items not already in primary results
  const primaryIdSet = new Set(rssFeedItemIds)
  const memberItemIds = [
    ...new Set(
      Object.values(storyMemberIds)
        .flat()
        .filter(id => !primaryIdSet.has(id)),
    ),
  ]
  const allItemIds = [...rssFeedItemIds, ...memberItemIds]

  const sharedByUserIds = [
    ...new Set(result.results.flatMap(r => (r.shared_by_user_id ? [r.shared_by_user_id] : []))),
  ]

  // Use streaming pattern: pass promises directly to allow independent streaming
  const itemsPromise = getRssFeedItemByIdCachedBatch(allItemIds)
  const usersPromise =
    sharedByUserIds.length > 0 ? getPublicUsersByAnyBatch(sharedByUserIds) : Promise.resolve([])

  // Look up related discussion posts by URL IDs from RSS feed items
  const relatedPostsPromise = itemsPromise.then(async items => {
    const urlIds = [...new Set(items.flatMap(item => (item?.url?.id ? [item.url.id] : [])))]
    const storyPostIdValues = Object.values(storyPostIds)
    if (urlIds.length === 0) return { related_posts_by_url_id: {}, postIds: storyPostIdValues }
    const related_posts_by_url_id = await getPostIdsByUrlIds(currentUser, urlIds)
    const postIds = [
      ...new Set([...Object.values(related_posts_by_url_id).flat(), ...storyPostIdValues]),
    ]
    return { related_posts_by_url_id, postIds }
  })

  // Build stories record (filter nulls from batch result)
  const storiesRecord: Record<string, unknown> = {}
  for (const story of storiesArr) {
    if (story) storiesRecord[story.id] = story
  }

  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    stories: storiesRecord,
    story_member_ids: storyMemberIds,
    story_post_ids: storyPostIds,
    rss_feed_items: itemsPromise.then(items =>
      indexById(items.map(item => (item == null ? item : proxyRssFeedItemCoverArt(item)))),
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
    rss_feed_item_elections: getRssFeedItemElectionByIdCachedBatch(allItemIds).then(indexById),
    users: usersPromise.then(users => indexById(users.filter(Boolean))),
    related_posts_by_url_id: relatedPostsPromise.then(r => r.related_posts_by_url_id),
    posts: relatedPostsPromise.then(r =>
      r.postIds.length > 0
        ? getPostByAnyCachedBatch(r.postIds)
            .then(posts => maskAnonymousPosts(posts, currentUser))
            .then(indexById)
        : {},
    ),
    posts_metrics: relatedPostsPromise.then(r =>
      r.postIds.length > 0 ? getPostMetricsByAnyCachedBatch(r.postIds).then(indexById) : {},
    ),
  }

  output.bookmarks = itemsPromise.then(async items => {
    const itemIds = items.flatMap(item => (item != null ? [item.id] : []))
    if (itemIds.length === 0) return undefined
    const bookmarks = await getBookmarksForEntities(currentUser, 'rss_feed_item', itemIds)
    return Object.keys(bookmarks).length > 0 ? bookmarks : undefined
  })

  output.election_votes = itemsPromise.then(async items => {
    const itemIds = items.flatMap(item => (item != null ? [item.id] : []))
    if (itemIds.length === 0) return

    const votes = await getRssFeedItemElectionVotesByUser(currentUser.id, itemIds)
    const votesMap = new Map(votes.map(vote => [vote.entity_id, vote]))
    const election_votes = electionVotesMapToRecord(votesMap)
    return Object.keys(election_votes).length > 0 ? election_votes : undefined
  })

  output.rss_feed_bookmarks = itemsPromise.then(async items => {
    const feedIds = [...new Set(items.flatMap(item => (item != null ? [item.rss_feed.id] : [])))]
    if (feedIds.length === 0) return {}
    const bookmarks = await getBookmarksForEntities(currentUser, 'rss_feed', feedIds)
    return Object.keys(bookmarks).length > 0 ? bookmarks : {}
  })

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
