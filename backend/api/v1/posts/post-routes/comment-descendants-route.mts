import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getCommentAncestorTargetByAny, resolveCommentAncestorPage } from '@services/comments'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import { getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
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
import { labelAndMaskPosts } from '@services/content-provenance'
import {
  canViewPost,
  getPostsOrDeletedCommentStubs,
  getCommentReadStateUnderReadableRoot,
  maskPlaceholderMetrics,
} from '@services/posts'
import type { CommunityMemberRole } from '@services/communities/types'
import app from '../../../app.mts'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import { getRouteAccessPost } from '@services/posts/route-access'
import { apiResponse } from '@vouchington/utils/api-response-contract'
import { stringFromUnknown } from '@ts-shared/utils/string-from-unknown'
import { apiQuery } from '../../../api-query-contract.mts'
import {
  commentAncestorPaginationQuery,
  prepareCommentAncestorPagination,
} from '@services/search-params/comment-ancestor-pagination'

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

  const target = await getCommentAncestorTargetByAny(ctx.params.idOrSlug!)
  ctx.assert(target, 404, 'Post not found')
  const { ancestors, targetId, pageInfo } = await resolveCommentAncestorPage({
    after:
      preparedPagination.pageQuery.after === undefined
        ? undefined
        : stringFromUnknown(preparedPagination.pageQuery.after),
    limit: preparedPagination.pageQuery.limit,
    target,
  })
  ctx.assert(ancestors.length > 0, 404, 'Post not found')
  ctx.assert(targetId, 404, 'Post not found')

  const rootAncestor = ancestors[0]
  const ancestorIds = ancestors.map(a => a.id)
  const accessIds = [...new Set([...ancestorIds, targetId])]
  // The root is the first ancestor, so the page batch is the root read. A separate
  // getPostByAnyCached would add a round trip and then repeat that id in the batch.
  const fetchedPosts = await getPostsOrDeletedCommentStubs(accessIds)
  const fetchedPostsById = new Map(
    fetchedPosts.filter(post => post != null).map(post => [post.id, post]),
  )
  const rootPost = rootAncestor ? fetchedPostsById.get(rootAncestor.id) : undefined
  ctx.assert(rootPost, 404, 'Post not found')
  ctx.assert(await getRouteAccessPost(rootPost), 404, 'Post not found')
  // Nothing below an unreadable root is served, not even a placeholder: every comment in the
  // thread, placeholder or not, is only as readable as its root.
  ctx.assert(await canViewPost(currentUser, rootPost), 404, 'Post not found')
  const posts = ancestorIds.flatMap(id => {
    const post = fetchedPostsById.get(id)
    return post ? [post] : []
  })
  const fetchedPostIds = new Set(posts.map(post => post.id))
  ctx.assert(
    ancestors.every(ancestor => fetchedPostIds.has(ancestor.id)),
    404,
    'Post not found',
  )
  // A reply is readable when it and the thread root pass. A deleted or unmoderated ancestor comes
  // back as a placeholder, and so does the target when a valid reply sits below it.
  const targetPost = fetchedPostsById.get(targetId)
  ctx.assert(targetPost, 404, 'Post not found')
  // The root was checked above, so a comment is only classified by its own state.
  ctx.assert(
    targetPost.post_type !== 'comment' ||
      (await getCommentReadStateUnderReadableRoot(currentUser, targetPost, rootPost.id)),
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
  const postsPromise = labelAndMaskPosts(posts, currentUser)

  const output: Record<string, unknown> = {
    results,
    page_info: pageInfo,
    posts: postsPromise.then(posts => {
      const byId = indexById(posts)
      if (!currentUser) return byId
      const contentEditNow = Date.now()
      return Object.fromEntries(
        Object.entries(byId).map(([id, post]) => {
          // A placeholder carries no text or author, so it offers no action.
          if (post.placeholder_state) return [id, post]
          const canUpdatePost = currentUserCanUpdatePost(currentUser, post)
          return [
            id,
            {
              ...post,
              ...(canUpdatePost
                ? { can_edit_content: isPostContentEditable(currentUser, post, contentEditNow) }
                : {}),
              can_delete: currentUserCanDeletePost(currentUser, post, { communityMemberRole }),
              can_lock: currentUserCanLockPost(currentUser, post, { communityMemberRole }),
            },
          ]
        }),
      )
    }),
    posts_metrics: Promise.all([postsPromise, getPostMetricsByAnyCachedBatch(ancestorIds)]).then(
      ([posts, metrics]) => indexById(maskPlaceholderMetrics(posts, metrics)),
    ),
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
