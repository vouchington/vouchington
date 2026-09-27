import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { getCommunityOrThrow } from '@services/communities/get'
import { getCommunityMember } from '@services/communities/members/get'
import {
  getCommunitySavedReplies,
  createSavedReply,
  deleteSavedReply,
  currentUserCanManageSavedReplies,
} from '@services/modmail'
import {
  buildPageInfo,
  decodeUuidCursor,
  isRankingCursor,
  rankingPaginationParser,
} from '@modules/pagination'

// GET /api/v1/communities/:idOrSlug/saved-replies
app.route('/api/v1/communities/:idOrSlug/saved-replies').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/saved-replies')

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(currentUserCanManageSavedReplies(currentUser, community, membership), 403, 'Forbidden')
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/saved-replies', {
    path: ctx.params,
  })

  const { after: encodedAfter, limit } = rankingPaginationParser.parse(ctx.query)
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isRankingCursor, 'Invalid saved reply cursor')
    : undefined
  const replies = await getCommunitySavedReplies(community.id, { after, limit })
  const hasMore = replies.length > limit
  const results = replies.slice(0, limit)
  ctx.json({
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: hasMore,
      getCursor: reply => ({ ranking: reply.order_index, id: reply.id }),
    }),
  })
})

// POST /api/v1/communities/:idOrSlug/saved-replies
app.route('/api/v1/communities/:idOrSlug/saved-replies').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/saved-replies')
  assertNotSuspended(currentUser)

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(currentUserCanManageSavedReplies(currentUser, community, membership), 403, 'Forbidden')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/saved-replies', {
    path: ctx.params,
    body,
  })
  ctx.assert(typeof body.body === 'string' && body.body.trim().length > 0, 400, 'body is required')
  ctx.assert((body.body as string).length <= 5000, 400, 'body must be 5000 characters or fewer')

  const reply = await createSavedReply(currentUser.id, community.id, {
    title: typeof body.title === 'string' ? body.title : '',
    body: body.body as string,
  })

  ctx.setStatus(201)
  ctx.json({ reply })
})

// DELETE /api/v1/communities/:idOrSlug/saved-replies/:id
app.route('/api/v1/communities/:idOrSlug/saved-replies/:id').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'DELETE:/api/v1/communities/:idOrSlug/saved-replies/:id',
  )
  assertNotSuspended(currentUser)

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(currentUserCanManageSavedReplies(currentUser, community, membership), 403, 'Forbidden')
  validateRequestContract(ctx, 'DELETE:/api/v1/communities/:idOrSlug/saved-replies/:id', {
    path: ctx.params,
  })

  const replyId = ctx.params.id!
  ctx.assert(isUUID(replyId), 422, 'Invalid reply ID')
  await deleteSavedReply(currentUser.id, community.id, replyId)

  ctx.setStatus(204)
})
