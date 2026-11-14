import { getRecommendationReviewerUsers } from '@services/topic-recommendations/reviewer-users'
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
import { getPostIds } from '@services/posts'
import { getAnonymousPostRowsByIdsCached } from '@services/posts/anonymous-snapshot'
import { similarSeedRejected } from '@services/posts/public-similar-seed'
import {
  parsePostsSearchParams,
  preparePostsSearchParams,
  resolvePostsSearchParams,
} from '@services/search-params'
import { isAdminUser } from '@services/users'
import { getPostCommunitiesRecord } from '@services/communities/post-communities-record'
import { getPostHackerNewsSummaries } from '@services/urls/hacker-news-sidecars'
import { getUrlEmbedsByUrlIds, type UrlEmbed } from '@services/rss-feed-items/get-url-embed'
import app from '../../../app.mts'
import { apiQuery } from '../../../api-query-contract.mts'
import { setPublicCacheHeaders } from '../../../cache-headers.mts'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import {
  getPostElectionSidecars,
  indexPostModerationsByPostId,
  getPostElectionVotesWithModerations,
} from '../admin-moderation-data.mts'
import type { PostsResponseInput } from './posts-response-types.mts'

app.route('/api/v1/posts').get(async (ctx: Context) => {
  ctx.set('Cache-Control', 'private, no-store')
  apiQuery('GET:/api/v1/posts', parsePostsSearchParams)
  const currentUser = await getOptionalAuthAndRateLimit(ctx, 'GET:/api/v1/posts')
  const preparedSearchParams = preparePostsSearchParams(ctx.query, getPaginationLimits(25))
  validateRequestContract(ctx, 'GET:/api/v1/posts', { query: preparedSearchParams.validationQuery })
  if (!currentUser) setPublicCacheHeaders(ctx)

  const parsedSearchParams = await resolvePostsSearchParams(preparedSearchParams)
  const { shouldReturnEmpty, searchOptions } = parsedSearchParams
  if (!currentUser) {
    searchOptions.limit = clampAnonLimit(searchOptions.limit)
    searchOptions.omitLimit = false
  }

  if (
    shouldReturnEmpty ||
    (await similarSeedRejected(searchOptions.similar_post_id, {
      requireCaller: false,
      hasCaller: currentUser !== undefined,
    }))
  ) {
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
      post_hacker_news_references: {},
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
    ? await getPostIds(currentUser, {
        ...searchOptions,
        exclude_for_user_id: currentUser.id,
      })
    : await getPostIdsCached(searchOptions)
  const candidateIds = result.results.map(row => row.id)
  const anonymousRows = currentUser
    ? null
    : await getAnonymousPostRowsByIdsCached(candidateIds, 'discovery')
  if (anonymousRows) result.results = result.results.filter((_, i) => anonymousRows[i]?.post)
  const postIds = result.results.map((r: { id: string }) => r.id)
  const postsAndRootsPromise = currentUser
    ? getPostsWithRootsByAnyCached(postIds)
    : Promise.resolve({
        posts: anonymousRows!.flatMap(row => (row.post ? [row.post] : [])),
        roots: anonymousRows!.flatMap(row => (row.root ? [row.root] : [])),
      })
  const rawPostsPromise = postsAndRootsPromise.then(postsAndRoots => postsAndRoots.posts)
  // Page posts and their roots are labelled together in one read of the provenance facts.
  const labelledPostsPromise = postsAndRootsPromise.then(async ({ posts, roots }) => {
    const labelled = await labelAndMaskPosts([...posts, ...roots], currentUser)
    return { posts: labelled.slice(0, posts.length), rootPosts: labelled.slice(posts.length) }
  })
  const postsPromise = labelledPostsPromise.then(({ posts }) => posts)
  const postsWithRootsPromise = labelledPostsPromise.then(({ posts, rootPosts }) => [
    ...posts,
    ...rootPosts,
  ])

  const { moderations: moderationsPromise, elections: electionsPromise } = getPostElectionSidecars(
    currentUser,
    postIds,
  )
  const output: PostsResponseInput = {
    results: result.results,
    page_info: result.page_info,
    posts: postsWithRootsPromise.then(indexById),
    users: postsPromise.then(getRecommendationReviewerUsers),
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
    post_hacker_news_references: getPostHackerNewsSummaries(postIds),
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
