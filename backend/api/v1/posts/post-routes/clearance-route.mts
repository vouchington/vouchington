import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { indexById } from '@modules/utils'
import { getCommentDescendantsPage } from '@services/comments'
import { maybeSanitizeElections } from '@services/elections-votes/shared/sanitize-election'
import { getPostMetricsByAnyCachedBatch } from '@services/entity-fetch'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getCommunityMember } from '@services/communities/members/get'
import {
  currentUserCanDeletePost,
  currentUserCanLockPost,
  currentUserCanUpdatePost,
  isPostContentEditable,
} from '@services/posts/authorization'
import { labelAndMaskPosts } from '@services/content-provenance'
import {
  getPostsOrDeletedCommentStubs,
  getRequestedPostReadState,
  maskPlaceholderMetrics,
} from '@services/posts'
import type { CommunityMemberRole } from '@services/communities/types'
import { isAdminUser } from '@services/users'
import app from '../../../app.mts'
import { setPublicCacheHeaders } from '../../../cache-headers.mts'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import { apiQuery } from '../../../api-query-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import {
  getPostElectionSidecars,
  indexPostModerationsByPostId,
  getPostElectionVotesWithModerations,
} from '../admin-moderation-data.mts'
import { getRouteAccessPost, getRoutePostByAnyCached } from '@services/posts/route-access'
import {
  commentDescendantPaginationParser as descendantsParser,
  parseCommentDescendantPagination,
} from '@services/search-params/comment-descendant-pagination'

app.route('/api/v1/posts/:idOrSlug/descendants').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/posts/:idOrSlug/descendants', descendantsParser)
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/posts/:idOrSlug/descendants',
  )
  const { post, root } = await getRoutePostByAnyCached(ctx.params.idOrSlug!, {
    includeDeleted: true,
  })
  ctx.assert(post, 404, 'Post not found')

  // A placeholder comment can start a walk, so a collapsed one can be expanded.
  const rootPost = await getRouteAccessPost(post, root)
  ctx.assert(rootPost, 404, 'Post not found')
  const readState = await getRequestedPostReadState(
    currentUser,
    post,
    post.root_post_id ? root : null,
  )
  ctx.assert(readState, 404, 'Post not found')

  const pagination = parseCommentDescendantPagination(ctx.query)
  const { after: _rawAfter, ...queryWithoutAfter } = ctx.query
  const validationQuery = prepareQueryForValidation(
    pagination.after === undefined
      ? queryWithoutAfter
      : { ...queryWithoutAfter, after: pagination.after },
    descendantsParser.queryContract,
  )
  if (ctx.query.limit !== undefined) validationQuery.limit = pagination.limit
  validateRequestContract(ctx, 'GET:/api/v1/posts/:idOrSlug/descendants', {
    path: ctx.params,
    query: validationQuery,
  })
  const { ids: commentIds, pageInfo } = await getCommentDescendantsPage(currentUser, post, {
    limit: pagination.limit,
    after: pagination.after,
  })
  const results = commentIds.map(id => ({
    id,
    __entity_type: 'post' as const,
    ranking: 0,
    search_vector_ts: null,
  }))

  ctx.set('Cache-Control', 'private, no-store')
  if (!currentUser) setPublicCacheHeaders(ctx)

  let communityMemberRole: CommunityMemberRole | null = null
  if (currentUser && rootPost.community_id) {
    const membership = await getCommunityMember(rootPost.community_id, currentUser.id)
    communityMemberRole = membership?.role ?? null
  }

  const postsPromise = getPostsOrDeletedCommentStubs(commentIds).then(posts =>
    labelAndMaskPosts(posts, currentUser),
  )
  const { moderations: moderationsPromise, elections: electionsPromise } = getPostElectionSidecars(
    currentUser,
    commentIds,
  )
  const output: Record<string, unknown> = {
    results,
    page_info: pageInfo,
    posts: postsPromise.then(posts => {
      const byId = indexById(posts)
      if (!currentUser) return byId
      const contentEditNow = Date.now()
      return Object.fromEntries(
        Object.entries(byId).map(([id, p]) => {
          // A placeholder carries no text or author, so it offers no action.
          if (p.placeholder_state) return [id, p]
          const canUpdatePost = currentUserCanUpdatePost(currentUser, p)
          return [
            id,
            {
              ...p,
              ...(canUpdatePost
                ? { can_edit_content: isPostContentEditable(currentUser, p, contentEditNow) }
                : {}),
              can_delete: currentUserCanDeletePost(currentUser, p, { communityMemberRole }),
              can_lock: currentUserCanLockPost(currentUser, p, { communityMemberRole }),
            },
          ]
        }),
      )
    }),
    posts_metrics: Promise.all([postsPromise, getPostMetricsByAnyCachedBatch(commentIds)]).then(
      ([posts, metrics]) => indexById(maskPlaceholderMetrics(posts, metrics)),
    ),
    post_elections: electionsPromise
      .then(groups => groups.post)
      .then(indexById)
      .then(elections => maybeSanitizeElections(currentUser, elections)),
    markdown_to_html: postsPromise.then(async posts => {
      const postsMap = indexById(posts)
      const entities = commentIds.flatMap(id => {
        const markdown = postsMap[id]?.markdown ?? ''
        return markdown ? [{ id, markdown, created_by_id: postsMap[id]?.created_by_id ?? '' }] : []
      })
      const adminIds = await getAdminUserIdsFromPosts(posts)
      return renderMarkdownBatch(entities, adminIds)
    }),
  }

  if (currentUser) {
    output.bookmarks = getBookmarksForEntities(currentUser, 'post', commentIds).then(b =>
      Object.keys(b).length > 0 ? b : undefined,
    )

    output.election_votes = Promise.all([postsPromise, moderationsPromise]).then(
      ([resolvedPosts, moderations]) =>
        getPostElectionVotesWithModerations(
          currentUser.id,
          resolvedPosts.flatMap(resolvedPost => (resolvedPost ? [resolvedPost.id] : [])),
          moderations,
          'undefined',
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
