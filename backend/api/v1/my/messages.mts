import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  findOrCreateDirectConversation,
  createGroupConversation,
  createConversationMessage,
  getMyDirectConversations,
  getConversationMessages,
  getConversationParticipants,
  currentUserCanViewConversation,
  currentUserCanSendMessage,
  currentUserCanMessageUser,
} from '@services/messaging'
import { anyPairAmongUsersBlockedOrMuted } from '@services/entity-relations/check-block-mute'
import { getPrivateUserByAny } from '@services/users/get'
import { assertNotSuspended } from '@services/users'
import { isUUID } from '@modules/utils'
import { requireAuth } from '../../response-helpers.mts'
import {
  buildPageInfo,
  decodeUuidCursor,
  encodeCursor,
  isSimpleCursor,
  isPreciseTimestampCursor,
  preciseTimestampPaginationParser,
  simplePaginationParser,
} from '@modules/pagination'

// GET /api/v1/my/messages
app.route('/api/v1/my/messages').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages')

  const { after: encodedAfter, limit } = preciseTimestampPaginationParser.parse(ctx.query)
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isPreciseTimestampCursor, 'Invalid conversation cursor')
    : undefined

  const conversations = await getMyDirectConversations(currentUser.id, { after, limit })
  const hasMore = conversations.length > limit
  const cursorRows = conversations.slice(0, limit)
  const results = cursorRows.map(({ cursor_timestamp: _, ...conversation }) => conversation)
  ctx.json({
    results,
    page_info: buildPageInfo(cursorRows, {
      hasNextPage: hasMore,
      getCursor: conversation => ({
        timestamp: conversation.cursor_timestamp,
        id: conversation.id,
      }),
    }),
  })
})

// POST /api/v1/my/messages
app.route('/api/v1/my/messages').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/messages')
  assertNotSuspended(currentUser)

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    400,
    'Invalid request body',
  )

  const rawUserIds: string[] = []
  if (typeof body.user_id === 'string') {
    rawUserIds.push(body.user_id)
  } else if (Array.isArray(body.user_ids)) {
    ctx.assert(body.user_ids.length > 0, 400, 'user_ids must be a non-empty array')
    ctx.assert(
      body.user_ids.every((id: unknown) => typeof id === 'string'),
      400,
      'user_ids must be strings',
    )
    rawUserIds.push(...(body.user_ids as string[]))
  } else {
    ctx.throw(400, 'user_id or user_ids is required')
  }

  ctx.assert(rawUserIds.length > 0, 400, 'At least one recipient is required')
  ctx.assert(rawUserIds.length <= 25, 400, 'Too many recipients — maximum is 25')
  for (const id of rawUserIds) {
    ctx.assert(isUUID(id), 422, 'user_id must be a UUID')
  }
  // Normalize to lowercase so case variants of the same UUID compare equal, then deduplicate.
  const userIds = Array.from(new Set(rawUserIds.map(id => id.toLowerCase())))
  ctx.assert(!userIds.includes(currentUser.id), 400, 'Cannot message yourself')

  const recipients = await Promise.all(userIds.map(id => getPrivateUserByAny(id)))
  const canMessageChecks = await Promise.all(
    recipients.map((recipient, i) => {
      ctx.assert(recipient, 404, 'Recipient not found')
      return currentUserCanMessageUser(currentUser.id, userIds[i]!, recipient)
    }),
  )
  for (const canMessage of canMessageChecks) {
    ctx.assert(canMessage, 403, 'You cannot send messages to this user')
  }

  if (userIds.length > 1) {
    const pairBlocked = await anyPairAmongUsersBlockedOrMuted(userIds)
    ctx.assert(!pairBlocked, 403, 'Cannot create a group containing blocked users')
  }

  const conversation =
    userIds.length === 1
      ? await findOrCreateDirectConversation(currentUser.id, userIds[0]!)
      : await createGroupConversation(currentUser.id, userIds)

  ctx.setStatus(201)
  ctx.json({ conversation })
})

// GET /api/v1/my/messages/:conversationId/messages
app.route('/api/v1/my/messages/:conversationId/messages').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages/:conversationId/messages')

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const canView = await currentUserCanViewConversation(currentUser.id, conversationId)
  ctx.assert(canView, 403, 'Access denied')

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

// POST /api/v1/my/messages/:conversationId/messages
app.route('/api/v1/my/messages/:conversationId/messages').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/messages/:conversationId/messages')
  assertNotSuspended(currentUser)

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const canSend = await currentUserCanSendMessage(currentUser.id, conversationId)
  ctx.assert(canSend, 403, 'Access denied')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(
    body !== null && typeof body === 'object' && !Array.isArray(body),
    400,
    'Invalid request body',
  )
  ctx.assert(typeof body.text === 'string' && body.text.trim().length > 0, 400, 'text is required')

  const message = await createConversationMessage(
    currentUser.id,
    conversationId,
    body.text as string,
  )

  ctx.setStatus(201)
  ctx.json({ message })
})

// GET /api/v1/my/messages/:conversationId/participants
app.route('/api/v1/my/messages/:conversationId/participants').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages/:conversationId/participants')

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const canView = await currentUserCanViewConversation(currentUser.id, conversationId)
  ctx.assert(canView, 403, 'Access denied')

  const { after: encodedAfter, limit } = simplePaginationParser.parse(ctx.query)
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isSimpleCursor, 'Invalid participant cursor')
    : undefined
  const participants = await getConversationParticipants(conversationId, { after, limit })
  const hasMore = participants.length > limit
  const results = participants.slice(0, limit)
  ctx.json({
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: hasMore,
      getCursor: participant => ({ id: participant.id }),
    }),
  })
})
