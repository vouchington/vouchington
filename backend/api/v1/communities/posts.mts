import app from '../../app.mts'
import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { getOptionalAuthAndRateLimit, requireAuth } from '../../response-helpers.mts'
import {
  loadCommunityForViewer,
  loadCommunityForModerator,
  searchCommunityPosts,
  searchPendingPosts,
  approvePublication,
  rejectPublication,
  unpublishPost,
  getPinnedPostIds,
} from '@services/communities'
import { attachPostClaims } from '@services/moderation-claims'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getPostByAnyCachedBatch, getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { getUrlEmbedsByUrlIds } from '@services/rss-feed-items/get-url-embed'
import { isAdminUser } from '@services/users'
import { indexById } from '@modules/utils'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import { resolveHashtagTopicSearch } from '@services/search-params'
import {
  shouldExcludeCommunityPinnedPosts,
  shouldIncludeCommunityPinnedPosts,
} from './posts-pinned-helpers.mts'
import { sendHashtagTopicSearchErrorResponse } from '../hashtag-search-error-response.mts'
type CachedPost = Awaited<ReturnType<typeof getPostByAnyCachedBatch>>[number]
async function buildLinkEmbedsSidecar(
  posts: CachedPost[],
  access: 'administrator' | 'public',
): Promise<Record<string, unknown> | undefined> {
  const urlIds = [
    ...new Set(posts.flatMap(p => (p?.post_type === 'link' && p.url_id ? [p.url_id] : []))),
  ]
  if (urlIds.length === 0) return undefined
  const embedsByUrlId = await getUrlEmbedsByUrlIds(urlIds, {}, access)
  const record: Record<string, unknown> = {}
  for (const post of posts) {
    if (post?.post_type === 'link' && post.url_id && embedsByUrlId[post.url_id]) {
      record[post.id] = embedsByUrlId[post.url_id]
    }
  }
  return Object.keys(record).length > 0 ? record : undefined
}
app.route('/api/v1/communities/:idOrSlug/posts').get(async (ctx: Context) => {
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/posts',
  )
  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const { community } = await loadCommunityForViewer(currentUser, idOrSlug)
  const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
  const after = ctx.query.after as string | undefined
  const requestedSort = ctx.query.sort as string | undefined
  const sort = requestedSort === 'hot' ? 'hot' : 'new'
  const hashtagSearchOptions = await resolveHashtagTopicSearch(ctx.query.q).catch(error =>
    sendHashtagTopicSearchErrorResponse(ctx, error),
  )
  if (!hashtagSearchOptions) return
  const hasHashtagFilter =
    hashtagSearchOptions.hasUnknown || hashtagSearchOptions.filters.length > 0

  const isFirstPage = !after
  const shouldIncludePinnedPosts = shouldIncludeCommunityPinnedPosts({
    after,
    hasHashtagFilter,
    textSearchQuery: hashtagSearchOptions.textSearchQuery,
    topicIds: hashtagSearchOptions.topicIds,
  })
  const shouldExcludePinnedPosts = shouldExcludeCommunityPinnedPosts({
    hasHashtagFilter,
    textSearchQuery: hashtagSearchOptions.textSearchQuery,
    topicIds: hashtagSearchOptions.topicIds,
  })
  const pinnedPostIds = shouldExcludePinnedPosts
    ? await getPinnedPostIds(community.id, currentUser ?? null)
    : []

  const result = await searchCommunityPosts(community.id, {
    currentUser: currentUser ?? null,
    limit,
    after,
    sort,
    excludePostIds: pinnedPostIds,
    text_search_query: hashtagSearchOptions.textSearchQuery,
    hashtag_topic_ids: hashtagSearchOptions.topicIds,
    hashtag_alias_ids: hashtagSearchOptions.filters.flatMap(filter =>
      filter.kind === 'exact_alias' ? [filter.aliasId] : [],
    ),
    has_unknown_hashtag: hashtagSearchOptions.hasUnknown,
  })

  const resultPostIds = result.results.map(p => p.id)
  const allPostIds = isFirstPage
    ? [...new Set([...pinnedPostIds, ...resultPostIds])]
    : resultPostIds

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  const rawPostsPromise = getPostByAnyCachedBatch(allPostIds)
  const embedAccess = isAdminUser(currentUser) ? 'administrator' : 'public'

  const output: Record<string, unknown> = {
    pinned_post_ids: isFirstPage && shouldIncludePinnedPosts ? pinnedPostIds : [],
    results: resultPostIds.map(id => ({ __entity_type: 'post' as const, id })),
    page_info: result.page_info,
    posts: rawPostsPromise.then(indexById),
    posts_metrics: getPostMetricsByAnyCachedBatch(allPostIds).then(indexById),
    communities: {
      [community.id]: { id: community.id, name: community.name, slug: community.slug },
    },
    post_link_embeds: rawPostsPromise.then(posts => buildLinkEmbedsSidecar(posts, embedAccess)),
  }

  if (currentUser) {
    output.bookmarks = getBookmarksForEntities(currentUser, 'post', allPostIds).then(b =>
      Object.keys(b).length > 0 ? b : undefined,
    )
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})

app.route('/api/v1/communities/:idOrSlug/posts/pending').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/posts/pending')

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const { community } = await loadCommunityForModerator(currentUser, idOrSlug)

  const limit = ctx.query.limit ? Number(ctx.query.limit) : undefined
  const after = ctx.query.after as string | undefined

  const result = await searchPendingPosts(community.id, { limit, after })
  const postIds = result.results.map(p => p.id as string)
  const pendingPostsWithClaims = await attachPostClaims(result.results as Array<{ id: string }>)
  const claimByPostId = new Map(pendingPostsWithClaims.map(r => [r.id, r.claim]))
  const escalatedAtByPostId = new Map(
    result.results.map(r => [
      r.id as string,
      ((r as Record<string, unknown>).escalated_at as string | null) ?? null,
    ]),
  )

  const searchResults = postIds.map(id => ({ __entity_type: 'post' as const, id }))
  const pendingRawPostsPromise = getPostByAnyCachedBatch(postIds)
  const embedAccess = isAdminUser(currentUser) ? 'administrator' : 'public'

  const output: Record<string, unknown> = {
    results: searchResults,
    page_info: result.page_info,
    posts: pendingRawPostsPromise.then(posts => {
      const byId = indexById(posts)
      for (const [id, post] of Object.entries(byId)) {
        ;(post as Record<string, unknown>).claim = claimByPostId.get(id) ?? null
        ;(post as Record<string, unknown>).escalated_at = escalatedAtByPostId.get(id) ?? null
      }
      return byId
    }),
    posts_metrics: getPostMetricsByAnyCachedBatch(postIds).then(indexById),
    post_link_embeds: pendingRawPostsPromise.then(posts =>
      buildLinkEmbedsSidecar(posts, embedAccess),
    ),
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})

app.route('/api/v1/communities/:idOrSlug/posts/:postId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/communities/:idOrSlug/posts/:postId')

  const { idOrSlug, postId } = ctx.params as { idOrSlug: string; postId: string }
  const { community } = await loadCommunityForModerator(currentUser, idOrSlug)

  const body = (await ctx.request.json('1mb')) as {
    status: 'approved' | 'rejected' | 'unpublished'
    reason?: string
  }
  ctx.assert(
    body && typeof body === 'object' && !Array.isArray(body),
    422,
    'Request body must be an object',
  )
  ctx.assert(body.status, 422, 'status is required')

  if (body.status === 'approved') {
    await approvePublication(currentUser, community.id, postId)
  } else if (body.status === 'rejected') {
    await rejectPublication(currentUser, community.id, postId, body.reason)
  } else if (body.status === 'unpublished') {
    await unpublishPost(currentUser, community.id, postId)
  } else {
    ctx.throw(422, "Invalid status; must be one of 'approved', 'rejected', or 'unpublished'")
  }

  ctx.setStatus(204)
})
