import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import { maybeSanitizeElections } from '@services/elections-votes/shared/sanitize-election'
import {
  getPostByAnyCachedBatch,
  getPostElectionByIdCachedBatch,
  getPostMetricsByAnyCachedBatch,
} from '@services/entity-fetch'
import { getPostFeedIds } from '@services/feeds'
import { VALID_POST_FEED_TYPES, type PostFeedType } from '@services/feeds/types'
import { maskAnonymousPosts } from '@services/posts'
import { getPostCommunitiesRecord } from '@services/communities/post-communities-record'
import { getUrlEmbedsByUrlIds } from '@services/rss-feed-items/get-url-embed'
import { getPublicUsersByAnyBatch } from '@services/users/get-public-batch'
import { isAdminUser } from '@services/users'
import { parseNumberParams } from '@ts-shared/utils/query'
import app from '../../../app.mts'
import { requireAuth } from '../../../response-helpers.mts'
import { sendHashtagTopicSearchErrorResponse } from '../../hashtag-search-error-response.mts'

import {
  loadOptionalFeedCommunityScope,
  parseHashtagFeedSearchOptions,
  postFeedParser,
} from './shared.mts'

app.route('/api/v1/feeds/posts/:feed_type').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/feeds/posts/:feed_type')

  const feedType = ctx.params.feed_type as PostFeedType
  ctx.assert(
    VALID_POST_FEED_TYPES.includes(feedType),
    404,
    `Invalid feed_type. Must be one of: ${VALID_POST_FEED_TYPES.join(', ')}`,
  )

  // Parse pagination and common filters (sort is parsed as 'new' | 'hot' | undefined)
  const paginationOptions = postFeedParser.parse(ctx.query)
  const hashtagSearchOptions = await parseHashtagFeedSearchOptions(ctx.query).catch(error =>
    sendHashtagTopicSearchErrorResponse(ctx, error),
  )
  if (!hashtagSearchOptions) return

  // Parse feed-specific parameters
  const communityParam = ctx.query.community as string | undefined
  const communityScope = await loadOptionalFeedCommunityScope(currentUser, feedType, communityParam)
  const options = {
    ...paginationOptions,
    ...parseNumberParams(ctx.query, ['min_score_follow_users', 'min_score_follow_topics']),
    ...('text_search_query' in hashtagSearchOptions
      ? { text_search_query: hashtagSearchOptions.text_search_query }
      : {}),
    ...hashtagSearchOptions,
    feed_type: feedType,
    community_id: communityScope?.community.id,
  }

  const result = await getPostFeedIds(currentUser, options)
  const postIds = result.results.map(r => r.entity_id)
  const sharedByUserIds = [
    ...new Set(result.results.flatMap(r => (r.shared_by_user_id ? [r.shared_by_user_id] : []))),
  ]

  // Use streaming pattern: pass promises directly to allow independent streaming
  // Keep raw posts for internal lookups (bookmarks need unmasked created_by_id)
  const rawPostsPromise = getPostByAnyCachedBatch(postIds)
  const postsPromise = rawPostsPromise.then(posts => maskAnonymousPosts(posts, currentUser))
  const usersPromise =
    sharedByUserIds.length > 0 ? getPublicUsersByAnyBatch(sharedByUserIds) : Promise.resolve([])
  const electionsPromise = getPostElectionByIdCachedBatch(postIds).then(indexById)

  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    posts: postsPromise.then(indexById),
    users: usersPromise.then(users => indexById(users.filter(Boolean))),
    posts_metrics: getPostMetricsByAnyCachedBatch(postIds).then(indexById),
    communities: rawPostsPromise.then(posts => getPostCommunitiesRecord(posts)),
    post_link_embeds: rawPostsPromise.then(async posts => {
      const urlIds = [
        ...new Set(posts.flatMap(p => (p?.post_type === 'link' && p.url_id ? [p.url_id] : []))),
      ]
      if (urlIds.length === 0) return undefined
      const embedsByUrlId = await getUrlEmbedsByUrlIds(
        urlIds,
        {},
        isAdminUser(currentUser) ? 'administrator' : 'public',
      )
      const record: Record<string, unknown> = {}
      for (const post of posts) {
        if (post?.post_type === 'link' && post.url_id && embedsByUrlId[post.url_id]) {
          record[post.id] = embedsByUrlId[post.url_id]
        }
      }
      return Object.keys(record).length > 0 ? record : undefined
    }),
    post_elections: electionsPromise.then(elections =>
      maybeSanitizeElections(currentUser, elections),
    ),
  }

  // Bookmarks need unmasked created_by_id; election_votes use masked posts
  output.bookmarks = rawPostsPromise.then(async posts => {
    const entities = indexById(posts)
    const creatorIds = [
      ...new Set(
        Object.values(entities).flatMap(post => (post.created_by_id ? [post.created_by_id] : [])),
      ),
    ] as string[]

    const [postBookmarks, creatorBookmarks] = await Promise.all([
      getBookmarksForEntities(currentUser, 'post', postIds),
      creatorIds.length > 0
        ? getBookmarksForEntities(currentUser, 'user', creatorIds)
        : Promise.resolve({}),
    ])

    const bookmarks = { ...creatorBookmarks, ...postBookmarks }
    return Object.keys(bookmarks).length > 0 ? bookmarks : undefined
  })

  output.election_votes = postsPromise.then(async posts => {
    const filteredPostIds = posts.flatMap(p => (p != null ? [p.id] : []))

    if (filteredPostIds.length === 0) return

    const votes = await getPostElectionVotesByUser(currentUser.id, filteredPostIds)
    const votesMap = new Map(votes.map(vote => [vote.entity_id, vote]))
    const election_votes = electionVotesMapToRecord(votesMap)
    return Object.keys(election_votes).length > 0 ? election_votes : undefined
  })

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
