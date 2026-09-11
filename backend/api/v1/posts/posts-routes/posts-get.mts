import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { clampAnonLimit } from '@modules/search-utils'
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
import { getPostIdsCached } from '@services/entity-fetch/search-caches'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import { searchPostModerationsByPostIds } from '@services/moderation'
import { getPostIds, getPublicPostIds, maskAnonymousPosts } from '@services/posts'
import { parsePostsSearchParams } from '@services/search-params'
import { isAdminUser } from '@services/users'
import { getPostCommunitiesRecord } from '@services/communities/post-communities-record'
import { getUrlEmbedsByUrlIds, type UrlEmbed } from '@services/rss-feed-items/get-url-embed'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import app from '../../../app.mts'
import { apiQuery } from '../../../response-contract.mts'
import { getOptionalAuthAndRateLimit } from '../../../response-helpers.mts'
import {
  getAgentModerationElectionsRecord,
  indexPostModerationsByPostId,
  mergeElectionVotesWithAgentModerations,
} from '../admin-moderation-data.mts'
import { sendHashtagTopicSearchErrorResponse } from '../../hashtag-search-error-response.mts'
import type { PostsResponseInput } from './posts-response-types.mts'

app.route('/api/v1/posts').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/posts', parsePostsSearchParams)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/posts')

  const parsedSearchParams = await parsePostsSearchParams(ctx.query).catch(error =>
    sendHashtagTopicSearchErrorResponse(ctx, error),
  )
  if (!parsedSearchParams) return
  const { shouldReturnEmpty, searchOptions } = parsedSearchParams
  if (!currentUser) {
    searchOptions.limit = clampAnonLimit(searchOptions.limit)
    searchOptions.omitLimit = false
  }

  if (shouldReturnEmpty) {
    if (!currentUser) {
      ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
    }

    const output: PostsResponseInput = {
      results: [],
      page_info: {
        has_next_page: false,
        end_cursor: null,
        start_cursor: null,
      },
      posts: {},
      posts_metrics: {},
      post_elections: {},
      markdown_to_html: {},
      post_link_embeds: {},
    }

    if (isAdminUser(currentUser)) {
      output.post_moderations = {}
      output.agent_moderation_elections = {}
    }

    ctx.setType('json')
    await ctx.pipeline(streamJsonObject(output))
    return
  }

  const result = currentUser
    ? await getPostIds(currentUser, searchOptions)
    : await getPostIdsCached(searchOptions)
  if (!currentUser) {
    const publicPostIds = await getPublicPostIds(result.results.map(result => result.id))
    result.results = result.results.filter(result => publicPostIds.has(result.id))
  }
  const postIds = result.results.map((r: { id: string }) => r.id)
  const postIdSet = new Set(postIds)
  const rawPostsPromise = getPostByAnyCachedBatch(postIds)
  const postsPromise = rawPostsPromise.then(posts => maskAnonymousPosts(posts, currentUser))
  const postsWithRootsPromise = Promise.all([rawPostsPromise, postsPromise]).then(
    async ([rawPosts, posts]) => {
      const rootPostIds = [
        ...new Set(rawPosts.flatMap(post => (post?.root_id ? [post.root_id] : []))),
      ].filter(rootPostId => !postIdSet.has(rootPostId))
      if (rootPostIds.length === 0) return posts
      const rawRootPosts = await getPostByAnyCachedBatch(rootPostIds)
      const rootPosts = await maskAnonymousPosts(rawRootPosts, currentUser)
      return [...posts, ...rootPosts]
    },
  )
  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const output: PostsResponseInput = {
    results: result.results,
    page_info: result.page_info,
    posts: postsWithRootsPromise.then(indexById),
    posts_metrics: getPostMetricsByAnyCachedBatch(postIds).then(indexById),
    post_elections: getPostElectionByIdCachedBatch(postIds)
      .then(indexById)
      .then(elections => maybeSanitizeElections(currentUser, elections)),
    markdown_to_html: postsPromise.then(async posts => {
      const postsMap = indexById(posts)
      const entities = postIds.flatMap(id => {
        const markdown = postsMap[id]?.markdown ?? ''
        return markdown ? [{ id, markdown, created_by_id: postsMap[id]?.created_by_id ?? '' }] : []
      })

      const adminIds = await getAdminUserIdsFromPosts(posts)
      return await renderMarkdownBatch(entities, adminIds)
    }),
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
      const record: Record<string, UrlEmbed> = {}
      for (const post of posts) {
        if (post?.post_type === 'link' && post.url_id && embedsByUrlId[post.url_id]) {
          record[post.id] = embedsByUrlId[post.url_id]
        }
      }
      return record
    }),
  }

  if (currentUser) {
    const postBookmarksPromise = getBookmarksForEntities(currentUser, 'post', postIds)

    output.bookmarks = Promise.all([postBookmarksPromise, postsPromise]).then(
      async ([postBookmarks, posts]) => {
        const creatorIds = [
          ...new Set(
            Object.values(indexById(posts)).flatMap(post =>
              post.created_by_id ? [post.created_by_id] : [],
            ),
          ),
        ] as string[]

        const creatorBookmarks =
          creatorIds.length > 0
            ? await getBookmarksForEntities(currentUser, 'user', creatorIds)
            : {}

        const bookmarks = { ...creatorBookmarks, ...postBookmarks }
        return bookmarks
      },
    )

    const postElectionVotesPromise = postsPromise.then(async posts => {
      const votablePostIds = posts.flatMap(p => (p != null ? [p.id] : []))

      if (votablePostIds.length === 0) return {}

      const votes = await getPostElectionVotesByUser(currentUser.id, votablePostIds)
      const votesMap = new Map(votes.map(vote => [vote.entity_id, vote]))
      return electionVotesMapToRecord(votesMap)
    })

    output.election_votes = postElectionVotesPromise

    if (isAdminUser(currentUser)) {
      const moderationsPromise = searchPostModerationsByPostIds(postIds)
      output.post_moderations = moderationsPromise.then(indexPostModerationsByPostId)
      output.agent_moderation_elections = moderationsPromise.then(getAgentModerationElectionsRecord)
      output.election_votes = Promise.all([postElectionVotesPromise, moderationsPromise]).then(
        ([baseVotes, moderations]) =>
          mergeElectionVotesWithAgentModerations(currentUser.id, moderations, baseVotes),
      )
    }
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
