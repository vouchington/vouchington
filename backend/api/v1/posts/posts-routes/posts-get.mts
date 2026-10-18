import { clampAnonLimit, getPaginationLimits } from '@services/pagination'
import { streamJsonObject, type Context } from '@jongleberry/api-server'

import { indexById } from '@modules/utils'
import { getBookmarkMapsForEntityGroups } from '@services/bookmarks/get'
import { maybeSanitizeElections } from '@services/elections-votes/shared/sanitize-election'
import { getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { getPostsWithRootsByAnyCached } from '@services/posts/get-cached-with-roots'
import { getPostIdsCached } from '@services/entity-fetch/search-caches'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import { labelAndMaskPosts } from '@services/content-provenance'
import { getPostIds, getPublicPostIds } from '@services/posts'
import {
  parsePostsSearchParams,
  preparePostsSearchParams,
  resolvePostsSearchParams,
} from '@services/search-params'
import { isAdminUser } from '@services/users'
import { getPostCommunitiesRecord } from '@services/communities/post-communities-record'
import { getUrlEmbedsByUrlIds, type UrlEmbed } from '@services/rss-feed-items/get-url-embed'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import app from '../../../app.mts'
import { apiQuery } from '../../../response-contract.mts'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import {
  getPostElectionSidecars,
  indexPostModerationsByPostId,
  getPostElectionVotesWithModerations,
} from '../admin-moderation-data.mts'
import type { PostsResponseInput } from './posts-response-types.mts'

app.route('/api/v1/posts').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/posts', parsePostsSearchParams)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/posts')
  const preparedSearchParams = preparePostsSearchParams(ctx.query, getPaginationLimits(25))
  validateRequestContract(ctx, 'GET:/api/v1/posts', { query: preparedSearchParams.validationQuery })

  const parsedSearchParams = await resolvePostsSearchParams(preparedSearchParams)
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
  const postsAndRootsPromise = getPostsWithRootsByAnyCached(postIds)
  const rawPostsPromise = postsAndRootsPromise.then(result => result.posts)
  const postsPromise = rawPostsPromise.then(posts => labelAndMaskPosts(posts, currentUser))
  const postsWithRootsPromise = Promise.all([postsAndRootsPromise, postsPromise]).then(
    async ([{ roots }, posts]) => [...posts, ...(await labelAndMaskPosts(roots, currentUser))],
  )
  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const { moderations: moderationsPromise, elections: electionsPromise } = getPostElectionSidecars(
    currentUser,
    postIds,
  )
  const output: PostsResponseInput = {
    results: result.results,
    page_info: result.page_info,
    posts: postsWithRootsPromise.then(indexById),
    posts_metrics: getPostMetricsByAnyCachedBatch(postIds).then(indexById),
    post_elections: electionsPromise
      .then(groups => groups.post)
      .then(indexById)
      .then(elections => maybeSanitizeElections(currentUser, elections)),
    markdown_to_html: postsPromise.then(async posts => {
      const postsMap = indexById(posts)
      const entities = postIds.flatMap(id => {
        const markdown = postsMap[id]?.markdown ?? ''
        return markdown ? [{ id, markdown, created_by_id: postsMap[id]?.created_by_id ?? '' }] : []
      })

      const adminIds = await getAdminUserIdsFromPosts(posts)
      return renderMarkdownBatch(entities, adminIds)
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
    output.bookmarks = postsPromise.then(posts => {
      const creatorIds = [
        ...new Set(
          Object.values(indexById(posts)).flatMap(post =>
            post.created_by_id ? [post.created_by_id] : [],
          ),
        ),
      ] as string[]

      return getBookmarkMapsForEntityGroups(currentUser, [
        { entityTypeName: 'post', entities: postIds },
        { entityTypeName: 'user', entities: creatorIds },
      ]).then(([postBookmarks, creatorBookmarks]) => ({
        ...creatorBookmarks,
        ...postBookmarks,
      }))
    })

    output.election_votes = Promise.all([postsPromise, moderationsPromise]).then(
      ([posts, moderations]) =>
        getPostElectionVotesWithModerations(
          currentUser.id,
          posts.flatMap(post => (post ? [post.id] : [])),
          moderations,
          'object',
        ),
    )

    if (isAdminUser(currentUser)) {
      output.post_moderations = moderationsPromise.then(indexPostModerationsByPostId)
      output.agent_moderation_elections = electionsPromise.then(groups =>
        indexById(groups.agent_moderation),
      )
    }
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})
