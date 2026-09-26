import { streamJsonObject, type Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../response-helpers.mts'
import { loadCommunityForViewer } from '@services/communities'
import { getRssFeedItemFeedIds } from '@services/feeds'
import createHttpError from 'http-errors'
import {
  getPostByAnyCachedBatch,
  getPostMetricsByAnyCachedBatch,
  getRssFeedItemByIdCachedBatch,
  getRssFeedItemElectionByIdCachedBatch,
} from '@services/entity-fetch'
import { getPostIdsByUrlIds } from '@services/posts/search/get-posts-by-url-ids'
import { maskAnonymousPosts } from '@services/posts'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getRssFeedItemElectionVotesByUser } from '@services/elections-votes/rss-feed-item'
import { getPublicUsersByAnyBatch } from '@services/users/get-public-batch'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import {
  getStoriesByIdBatch,
  getItemIdsByStoryIds,
  getVisiblePostStoryIdsByStoryIds,
} from '@services/stories'
import { createPaginationParser } from '@modules/pagination'
import { indexById } from '@modules/utils'
import { proxyRssFeedItemCoverArt } from '@services/rss-feed-items/proxy-cover-art'
import { getRssFeedItemEmbedsByItems, proxyThumbnailUrls } from '@services/rss-feed-items'
import { isAdminUser } from '@services/users'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { resolveHashtagTopicSearch } from '@services/search-params'
import { sendHashtagTopicSearchErrorResponse } from '../hashtag-search-error-response.mts'
import {
  VALID_COMMUNITY_NEWS_FEED_TYPES,
  isCatalogValue,
  type CommunityNewsFeedType,
} from '@ts-shared/feed-capabilities'

const communityNewsParser = createPaginationParser({
  cursor: { type: 'timestamp' as const },
  limit: { min: 1, max: 100, default: 25 },
  filters: {
    timeRange: true,
  },
})

app.route('/api/v1/communities/:idOrSlug/news').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/news',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const { community } = await loadCommunityForViewer(currentUser, idOrSlug)
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/news', {
    path: ctx.params,
  })

  const paginationOptions = communityNewsParser.parse(ctx.query)
  const hashtagSearchOptions = await resolveHashtagTopicSearch(ctx.query.q).catch(error =>
    sendHashtagTopicSearchErrorResponse(ctx, error),
  )
  if (!hashtagSearchOptions) return
  const has_related_posts =
    ctx.query.has_related_posts === 'true'
      ? true
      : ctx.query.has_related_posts === 'false'
        ? false
        : undefined
  const feedType = parseCommunityNewsFeedType(ctx.query.feed_type)

  const result = await getRssFeedItemFeedIds(currentUser, {
    ...paginationOptions,
    feed_type: feedType,
    community_id: community.id,
    text_search_query: hashtagSearchOptions.textSearchQuery,
    hashtag_topic_ids: hashtagSearchOptions.topicIds,
    hashtag_alias_ids: hashtagSearchOptions.filters.flatMap(filter =>
      filter.kind === 'exact_alias' ? [filter.aliasId] : [],
    ),
    has_unknown_hashtag: hashtagSearchOptions.hasUnknown,
    ...(has_related_posts !== undefined && { has_related_posts }),
  })
  const rssFeedItemIds = result.results.map(r => r.entity_id)
  const sharedByUserIds = [
    ...new Set(result.results.flatMap(r => (r.shared_by_user_id ? [r.shared_by_user_id] : []))),
  ]
  const storyIds = [
    ...new Set(result.results.flatMap(r => (r.story_id !== null ? [r.story_id] : []))),
  ]
  const [storiesArr, storyMemberIds, storyPostIds] = await Promise.all([
    getStoriesByIdBatch(storyIds),
    getItemIdsByStoryIds(storyIds),
    getVisiblePostStoryIdsByStoryIds(currentUser, storyIds),
  ])

  const primaryIdSet = new Set(rssFeedItemIds)
  const memberItemIds = [
    ...new Set(
      Object.values(storyMemberIds)
        .flat()
        .filter(id => !primaryIdSet.has(id)),
    ),
  ]
  const allItemIds = [...rssFeedItemIds, ...memberItemIds]
  const itemsPromise = getRssFeedItemByIdCachedBatch(allItemIds)
  const usersPromise =
    sharedByUserIds.length > 0 ? getPublicUsersByAnyBatch(sharedByUserIds) : Promise.resolve([])

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

  const stories: Record<string, unknown> = {}
  for (const story of storiesArr) {
    if (story) stories[story.id] = story
  }

  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    stories,
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
    users: usersPromise.then(users => indexById(users.filter(Boolean))),
    rss_feed_item_elections: getRssFeedItemElectionByIdCachedBatch(allItemIds).then(indexById),
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

  if (currentUser) {
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
  } else {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})

function parseCommunityNewsFeedType(queryValue: unknown): CommunityNewsFeedType {
  if (queryValue === undefined) return 'any'
  if (isCatalogValue(VALID_COMMUNITY_NEWS_FEED_TYPES, queryValue)) {
    return queryValue
  }
  throw createHttpError(
    422,
    `Invalid feed_type. Must be one of: ${VALID_COMMUNITY_NEWS_FEED_TYPES.join(', ')}`,
  )
}
