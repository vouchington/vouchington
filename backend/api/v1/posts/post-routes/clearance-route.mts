import { streamJsonObject, type Context } from '@jongleberry/api-server'
import { indexById } from '@modules/utils'
import { electionVotesMapToRecord } from '@modules/utils/collections'
import { getVisibleCommentDescendantIdsPage } from '@services/comments'
import { getPostElectionVotesByUser } from '@services/elections-votes/post'
import { maybeSanitizeElections } from '@services/elections-votes/shared/sanitize-election'
import {
  getPostByAnyCached,
  getPostByAnyCachedBatch,
  getPostElectionByIdCachedBatch,
  getPostMetricsByAnyCachedBatch,
} from '@services/entity-fetch'
import { getAdminUserIdsFromPosts } from '@services/markdown/admin-users'
import { renderMarkdownBatch } from '@services/markdown/batch-render'
import { searchPostModerationsByPostIds } from '@services/moderation'
import { getBookmarksForEntities } from '@services/bookmarks/get'
import { getCommunityMember } from '@services/communities/members/get'
import {
  currentUserCanDeletePost,
  currentUserCanLockPost,
  currentUserCanUpdatePost,
  isPostContentEditable,
} from '@services/posts/authorization'
import { canViewPost, maskAnonymousPosts } from '@services/posts'
import type { CommunityMemberRole } from '@services/communities/types'
import { isAdminUser } from '@services/users'
import { HTTP_CACHE_SHORT_MAX_AGE_SECONDS } from '@voucha/config'
import app from '../../../app.mts'
import { getOptionalAuthAndRateLimit, validateRequestContract } from '../../../response-helpers.mts'
import { apiQuery } from '../../../response-contract.mts'
import { prepareQueryForValidation } from '@services/search-params/prepare-query'
import {
  getAgentModerationElectionsRecord,
  indexPostModerationsByPostId,
  mergeElectionVotesWithAgentModerations,
} from '../admin-moderation-data.mts'
import { getRouteAccessPost } from '../get-route-access-post.mts'
import {
  createPaginationParser,
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'

const descendantsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 200, default: 100 },
})

app.route('/api/v1/posts/:idOrSlug/descendants').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/posts/:idOrSlug/descendants', descendantsParser)
  const currentUser = await getOptionalAuthAndRateLimit(
    ctx,
    'GET:/api/v1/posts/:idOrSlug/descendants',
  )
  const post = await getPostByAnyCached(ctx.params.idOrSlug!)
  ctx.assert(post, 404, 'Post not found')
  ctx.assert(!post.deleted_at, 404, 'Post not found')

  const rootPost = await getRouteAccessPost(post)
  ctx.assert(rootPost, 404, 'Post not found')
  ctx.assert(await canViewPost(currentUser, rootPost), 404, 'Post not found')

  const actualRootId = post.root_id ?? post.id
  const pagination = descendantsParser.parse(ctx.query)
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
  const cursorScope = `comment-descendants:${actualRootId}:${post.id}`
  const afterId = pagination.after
    ? decodeScopedUuidCursor(pagination.after, cursorScope, 'Invalid cursor format').id
    : undefined
  const { results: commentIds, hasNextPage } = await getVisibleCommentDescendantIdsPage(
    currentUser,
    actualRootId,
    post.id,
    { limit: pagination.limit, afterId },
  )
  const results = commentIds.map(id => ({
    id,
    __entity_type: 'post' as const,
    ranking: 0,
    search_vector_ts: null,
  }))

  if (!currentUser) {
    ctx.set('Cache-Control', `public, max-age=${HTTP_CACHE_SHORT_MAX_AGE_SECONDS}`)
  }

  let communityMemberRole: CommunityMemberRole | null = null
  if (currentUser && rootPost.community_id) {
    const membership = await getCommunityMember(rootPost.community_id, currentUser.id)
    communityMemberRole = membership?.role ?? null
  }

  const postsPromise = getPostByAnyCachedBatch(commentIds).then(posts =>
    maskAnonymousPosts(posts, currentUser),
  )
  const output: Record<string, unknown> = {
    results,
    page_info: {
      has_next_page: hasNextPage,
      end_cursor:
        hasNextPage && commentIds.at(-1)
          ? encodeScopedUuidCursor(commentIds.at(-1)!, cursorScope)
          : null,
      start_cursor: commentIds[0] ? encodeScopedUuidCursor(commentIds[0], cursorScope) : null,
    },
    posts: postsPromise.then(posts => {
      const byId = indexById(posts)
      if (!currentUser) return byId
      return Object.fromEntries(
        Object.entries(byId).map(([id, p]) => {
          const canUpdatePost = currentUserCanUpdatePost(currentUser, p)
          return [
            id,
            {
              ...p,
              ...(canUpdatePost ? { can_edit_content: isPostContentEditable(currentUser, p) } : {}),
              can_delete: currentUserCanDeletePost(currentUser, p, { communityMemberRole }),
              can_lock: currentUserCanLockPost(currentUser, p, { communityMemberRole }),
            },
          ]
        }),
      )
    }),
    posts_metrics: getPostMetricsByAnyCachedBatch(commentIds).then(indexById),
    post_elections: getPostElectionByIdCachedBatch(commentIds)
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

    const postElectionVotesPromise = postsPromise.then(async posts => {
      const postIds = posts.flatMap(p => (p != null ? [p.id] : []))
      if (postIds.length === 0) return undefined
      const votes = await getPostElectionVotesByUser(currentUser.id, postIds)
      return electionVotesMapToRecord(new Map(votes.map(v => [v.entity_id, v])))
    })

    output.election_votes = postElectionVotesPromise

    if (isAdminUser(currentUser)) {
      const moderationsPromise = searchPostModerationsByPostIds(commentIds)
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
