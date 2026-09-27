import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { getPrivateUserByAny } from '@services/users/get'
import { getCommunityOrThrow } from '@services/communities/get'
import { getCommunityMember } from '@services/communities/members/get'
import {
  openModmailThread,
  getCommunityModmailInbox,
  getMyModmailThreads,
  getModmailThread,
  hasOpenModmailThread,
  assignModmailThread,
  resolveModmailThread,
  unresolveModmailThread,
  currentUserCanViewModmailThread,
  currentUserCanOpenModmailThread,
} from '@services/modmail'
import {
  buildPageInfo,
  decodeUuidCursor,
  isPreciseTimestampCursor,
  preciseTimestampPaginationParser,
} from '@modules/pagination'
// GET /api/v1/communities/:idOrSlug/modmail
app.route('/api/v1/communities/:idOrSlug/modmail').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/communities/:idOrSlug/modmail')

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/modmail', {
    path: ctx.params,
  })

  const { after: encodedAfter, limit } = preciseTimestampPaginationParser.parse(ctx.query)
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isPreciseTimestampCursor, 'Invalid modmail cursor')
    : undefined

  // Members see their own threads; mods see all threads
  let threads
  if (currentUserCanViewModmailThread(currentUser, community, membership)) {
    threads = await getCommunityModmailInbox(community.id, { after, limit })
  } else if (membership && !membership.removed_at) {
    threads = await getMyModmailThreads(currentUser.id, {
      communityId: community.id,
      after,
      limit,
    })
  } else {
    ctx.throw(403, 'Forbidden')
  }
  const hasMore = threads.length > limit
  const cursorRows = threads.slice(0, limit)
  const results = cursorRows.map(({ cursor_timestamp: _, ...thread }) => thread)
  ctx.json({
    results,
    page_info: buildPageInfo(cursorRows, {
      hasNextPage: hasMore,
      getCursor: thread => ({ timestamp: thread.cursor_timestamp, id: thread.id }),
    }),
  })
})

// POST /api/v1/communities/:idOrSlug/modmail
app.route('/api/v1/communities/:idOrSlug/modmail').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/communities/:idOrSlug/modmail')
  assertNotSuspended(currentUser)

  const { idOrSlug } = ctx.params as { idOrSlug: string }
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  const canOpen = currentUserCanOpenModmailThread(currentUser, community, membership)
  ctx.assert(canOpen, 403, 'You must be a community member to open a modmail thread')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  validateRequestContract(ctx, 'POST:/api/v1/communities/:idOrSlug/modmail', {
    path: ctx.params,
    body,
  })

  const isMod = currentUserCanViewModmailThread(currentUser, community, membership)
  const rawSubjectUserId =
    isMod && typeof body.subject_user_id === 'string' ? body.subject_user_id : currentUser.id
  ctx.assert(isUUID(rawSubjectUserId), 422, 'subject_user_id must be a UUID')

  if (isMod && rawSubjectUserId !== currentUser.id) {
    const subjectUser = await getPrivateUserByAny(rawSubjectUserId)
    ctx.assert(subjectUser, 404, 'Subject user not found')
    const subjectMembership = await getCommunityMember(community.id, rawSubjectUserId)
    ctx.assert(
      subjectMembership && !subjectMembership.removed_at,
      422,
      'Subject user is not an active community member',
    )
  }

  const thread = await openModmailThread(currentUser.id, community.id, rawSubjectUserId)

  ctx.setStatus(201)
  ctx.json({ thread })
})

// GET /api/v1/communities/:idOrSlug/modmail/:conversationId
app.route('/api/v1/communities/:idOrSlug/modmail/:conversationId').get(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'GET:/api/v1/communities/:idOrSlug/modmail/:conversationId',
  )
  const { idOrSlug, conversationId } = ctx.params as { idOrSlug: string; conversationId: string }
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const [community, thread] = await Promise.all([
    getCommunityOrThrow(idOrSlug),
    getModmailThread(conversationId),
  ])
  const membership = await getCommunityMember(community.id, currentUser.id)
  ctx.assert(thread, 404, 'Modmail thread not found')
  ctx.assert(thread.community_id === community.id, 404, 'Modmail thread not found')
  const isMod = currentUserCanViewModmailThread(currentUser, community, membership)
  const isSubject = thread.subject_user_id === currentUser.id
  ctx.assert(isMod || isSubject, 403, 'Access denied')
  validateRequestContract(ctx, 'GET:/api/v1/communities/:idOrSlug/modmail/:conversationId', {
    path: ctx.params,
  })
  ctx.json({ thread })
})

// PATCH /api/v1/communities/:idOrSlug/modmail/:conversationId
app.route('/api/v1/communities/:idOrSlug/modmail/:conversationId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'PATCH:/api/v1/communities/:idOrSlug/modmail/:conversationId',
  )
  assertNotSuspended(currentUser)

  const { idOrSlug, conversationId } = ctx.params as {
    idOrSlug: string
    conversationId: string
  }
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const community = await getCommunityOrThrow(idOrSlug)
  const membership = await getCommunityMember(community.id, currentUser.id)

  ctx.assert(currentUserCanViewModmailThread(currentUser, community, membership), 403, 'Forbidden')

  const thread = await getModmailThread(conversationId)
  ctx.assert(thread, 404, 'Modmail thread not found')
  ctx.assert(thread.community_id === community.id, 404, 'Modmail thread not found')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  validateRequestContract(ctx, 'PATCH:/api/v1/communities/:idOrSlug/modmail/:conversationId', {
    path: ctx.params,
    body,
  })

  if (typeof body.assigned_mod_id === 'string') {
    ctx.assert(isUUID(body.assigned_mod_id), 422, 'assigned_mod_id must be a UUID')
    const assigneeMembership = await getCommunityMember(community.id, body.assigned_mod_id)
    ctx.assert(
      assigneeMembership &&
        !assigneeMembership.removed_at &&
        (assigneeMembership.role === 'owner' || assigneeMembership.role === 'moderator'),
      422,
      'assigned_mod_id must be an active owner or moderator in this community',
    )
    await assignModmailThread(conversationId, body.assigned_mod_id)
  }
  if (body.resolved === true) {
    await resolveModmailThread(conversationId, currentUser.id)
  } else if (body.resolved === false) {
    const alreadyOpen = await hasOpenModmailThread(
      thread.community_id!,
      thread.subject_user_id!,
      conversationId,
    )
    ctx.assert(!alreadyOpen, 409, 'Another open thread already exists for this subject')
    await unresolveModmailThread(conversationId)
  }

  const updated = await getModmailThread(conversationId)
  ctx.json({ thread: updated })
})
