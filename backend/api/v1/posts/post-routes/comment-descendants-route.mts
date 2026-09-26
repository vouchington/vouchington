import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { type CommentNode, getCommentAncestorsByAny } from '@services/comments'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import {
  getPostByAnyCached,
  getPostByAnyCachedBatch,
  getPostMetricsByAnyCachedBatch,
} from '@services/entity-fetch'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getCommunityMember } from '@services/communities/members/get'
import { getPostCommunitiesRecord } from '@services/communities/post-communities-record'
import {
  currentUserCanDeletePost,
  currentUserCanLockPost,
  currentUserCanUpdatePost,
  isPostContentEditable,
} from '@services/posts/authorization'
import { canViewPostsBatch, maskAnonymousPosts } from '@services/posts'
import type { CommunityMemberRole } from '@services/communities/types'
import app from '../../../app.mts'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import { getRouteAccessPost } from '../get-route-access-post.mts'
import { apiQuery, apiResponse } from '../../../response-contract.mts'
import {
  commentAncestorPaginationQuery,
  prepareCommentAncestorPagination,
} from '@services/search-params/comment-ancestor-pagination'
import { resolveCommentAncestorPage } from './comment-ancestor-pagination.mts'

app.route('/api/v1/posts/:idOrSlug/ancestors').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/posts/:idOrSlug/ancestors', commentAncestorPaginationQuery)
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/posts/:idOrSlug/ancestors',
  )
  const preparedPagination = prepareCommentAncestorPagination(ctx.query)
  validateRequestContract(ctx, 'GET:/api/v1/posts/:idOrSlug/ancestors', {
    path: ctx.params,
    query: preparedPagination.validationQuery,
  })

  let ancestors: CommentNode[]
  let targetId: string | undefined
  let pageInfo = {
    has_next_page: false,
    end_cursor: null as string | null,
    start_cursor: null as string | null,
  }

  if (preparedPagination.hasBoundedQuery) {
    if (!preparedPagination.pageQuery) throw new Error('Missing bounded ancestor pagination query')
    const page = await resolveCommentAncestorPage({
      idOrSlug: ctx.params.idOrSlug!,
      ...preparedPagination.pageQuery,
    })
    ctx.assert(page, 404, 'Post not found')
    ancestors = page.ancestors
    targetId = page.targetId
    pageInfo = page.pageInfo
  } else {
    ancestors = await getCommentAncestorsByAny(ctx.params.idOrSlug!)
    targetId = ancestors.at(-1)?.id
  }
  ctx.assert(ancestors.length > 0, 404, 'Post not found')
  ctx.assert(targetId, 404, 'Post not found')

  const rootAncestor = ancestors[0]
  const rootPost = await getPostByAnyCached(rootAncestor.id)
  ctx.assert(rootPost, 404, 'Post not found')
  ctx.assert(await getRouteAccessPost(rootPost), 404, 'Post not found')
  const ancestorIds = ancestors.map(a => a.id)
  const accessIds = [...new Set([...ancestorIds, targetId])]
  const fetchedPosts = await getPostByAnyCachedBatch(accessIds)
  const fetchedPostsById = new Map(
    fetchedPosts.filter(post => post != null).map(post => [post.id, post]),
  )
  const posts = ancestorIds.flatMap(id => {
    const post = fetchedPostsById.get(id)
    return post ? [post] : []
  })
  const fetchedPostIds = new Set(posts.map(post => post.id))
  ctx.assert(
    ancestors.every(ancestor => ancestor.deleted_at || fetchedPostIds.has(ancestor.id)),
    404,
    'Post not found',
  )
  const targetPost = fetchedPostsById.get(targetId)
  ctx.assert(targetPost && !targetPost.deleted_at, 404, 'Post not found')
  const accessPosts = [...fetchedPostsById.values()]
  const visibility = await canViewPostsBatch(currentUser, accessPosts)
  ctx.assert(
    accessPosts.every(post => visibility.get(post.id)),
    404,
    'Post not found',
  )

  // The edge Cache-Tag scheme (ts-shared/cache/cache-tags.mts) tags API detail routes by a
  // single leaf idOrSlug, but this response embeds every ancestor post. Editing a parent post
  // would leave a stale cached response for this route with no tag to purge it by, so this
  // route explicitly opts out of edge caching (CachedOrigin caches any 2xx response lacking an
  // explicit private/no-store/no-cache directive — omitting Cache-Control is not a bypass).
  ctx.set('Cache-Control', 'private, no-store')

  let communityMemberRole: CommunityMemberRole | null = null
  if (currentUser && rootPost.community_id) {
    const membership = await getCommunityMember(rootPost.community_id, currentUser.id)
    communityMemberRole = membership?.role ?? null
  }

  const results = ancestorIds.map(id => ({ id, __entity_type: 'post' as const }))
  const postsPromise = Promise.resolve(maskAnonymousPosts(posts, currentUser))

  const output: Record<string, unknown> = {
    results,
    page_info: pageInfo,
    posts: postsPromise.then(posts => {
      const byId = indexById(posts)
      if (!currentUser) return byId
      return Object.fromEntries(
        Object.entries(byId).map(([id, post]) => {
          const canUpdatePost = currentUserCanUpdatePost(currentUser, post)
          return [
            id,
            {
              ...post,
              ...(canUpdatePost
                ? { can_edit_content: isPostContentEditable(currentUser, post) }
                : {}),
              can_delete: currentUserCanDeletePost(currentUser, post, { communityMemberRole }),
              can_lock: currentUserCanLockPost(currentUser, post, { communityMemberRole }),
            },
          ]
        }),
      )
    }),
    posts_metrics: getPostMetricsByAnyCachedBatch(ancestorIds).then(indexById),
    markdown_to_html: postsPromise.then(async posts => {
      const postsMap = indexById(posts)
      const entities = ancestorIds.flatMap(id => {
        const markdown = postsMap[id]?.markdown ?? ''
        return markdown ? [{ id, markdown, created_by_id: postsMap[id]?.created_by_id ?? '' }] : []
      })
      const adminIds = await getAdminUserIdsFromPosts(posts)
      return renderMarkdownBatch(entities, adminIds)
    }),
    communities: getPostCommunitiesRecord([rootPost]),
  }

  if (currentUser) {
    output.bookmarks = getBookmarksForEntities(currentUser, 'post', ancestorIds).then(b =>
      Object.keys(b).length > 0 ? b : undefined,
    )

    output.election_votes = postsPromise.then(async posts => {
      const postIds = posts.flatMap(p => (p != null ? [p.id] : []))
      if (postIds.length === 0) return undefined
      const votes = await getPostElectionVotesByUser(currentUser.id, postIds)
      return electionVotesMapToRecord(new Map(votes.map(v => [v.entity_id, v])))
    })
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(apiResponse('GET:/api/v1/posts/:idOrSlug/ancestors', output)))
})
