import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { isUUID } from '@modules/utils'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { getCommunityOrThrow } from '@services/communities/get'
import { getCommunityMember } from '@services/communities/members/get'
import {
  getModmailThread,
  currentUserCanViewModmailThread,
  upsertModmailStaffParticipant,
} from '@services/modmail'
import { createConversationMessage, getConversationMessages } from '@services/messaging'
import {
  decodeUuidCursor,
  encodeCursor,
  isSimpleCursor,
  simplePaginationParser,
} from '@modules/pagination'

// GET /api/v1/communities/:idOrSlug/modmail/:conversationId/messages
app
  .route('/api/v1/communities/:idOrSlug/modmail/:conversationId/messages')
  .get(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/modmail/:conversationId/messages',
    )

    const { idOrSlug, conversationId } = ctx.params as {
      idOrSlug: string
      conversationId: string
    }
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
    validateRequestContract(
      ctx,
      'GET:/api/v1/communities/:idOrSlug/modmail/:conversationId/messages',
      { path: ctx.params },
    )

    const { after: encodedAfter, limit } = simplePaginationParser.parse(ctx.query)
    const after = encodedAfter
      ? decodeUuidCursor(encodedAfter, isSimpleCursor, 'Invalid message cursor')
      : undefined
    const messages = await getConversationMessages(conversationId, {
      after,
      limit,
    })
    const hasMore = messages.length > limit
    const results = hasMore ? messages.slice(1) : messages
    ctx.json({
      results,
      page_info: {
        has_next_page: hasMore,
        start_cursor: results.at(-1) ? encodeCursor({ id: results.at(-1)!.id }) : null,
        end_cursor: hasMore && results[0] ? encodeCursor({ id: results[0].id }) : null,
      },
    })
  })

// POST /api/v1/communities/:idOrSlug/modmail/:conversationId/messages
app
  .route('/api/v1/communities/:idOrSlug/modmail/:conversationId/messages')
  .post(async (ctx: Context) => {
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/modmail/:conversationId/messages',
    )
    assertNotSuspended(currentUser)

    const { idOrSlug, conversationId } = ctx.params as {
      idOrSlug: string
      conversationId: string
    }
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
    ctx.assert(
      !thread.resolved_at,
      409,
      'Thread is resolved; resolve must be undone before replying',
    )

    const body = (await ctx.request.json('10kb')) as Record<string, unknown>
    validateRequestContract(
      ctx,
      'POST:/api/v1/communities/:idOrSlug/modmail/:conversationId/messages',
      { path: ctx.params, body },
    )
    ctx.assert(
      typeof body.text === 'string' && body.text.trim().length > 0,
      400,
      'text is required',
    )

    // Ensure mod/staff callers have a participant row so createConversationMessage's
    // participant guard succeeds — idempotent if they were added via openModmailThread.
    if (isMod) {
      await upsertModmailStaffParticipant(conversationId, currentUser.id)
    }

    const message = await createConversationMessage(
      currentUser.id,
      conversationId,
      body.text as string,
    )

    ctx.setStatus(201)
    ctx.json({ message })
  })
