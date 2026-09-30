import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  createConversationMessage,
  getConversationMessages,
  getConversationParticipants,
  currentUserCanViewConversation,
  currentUserCanSendMessage,
} from '@services/messaging'
import { assertNotSuspended } from '@services/users'
import { isUUID } from '@modules/utils'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  buildPageInfo,
  decodeUuidCursor,
  encodeCursor,
  isSimpleCursor,
  simplePaginationParser,
} from '@modules/pagination'

type SendMessageRequest = { text: string }

// GET /api/v1/my/messages/:conversationId/messages
app.route('/api/v1/my/messages/:conversationId/messages').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages/:conversationId/messages')

  const conversationId = ctx.params.conversationId!
  ctx.assert(isUUID(conversationId), 422, 'Invalid conversation ID')
  const canView = await currentUserCanViewConversation(currentUser.id, conversationId)
  ctx.assert(canView, 403, 'Access denied')
  validateRequestContract(ctx, 'GET:/api/v1/my/messages/:conversationId/messages', {
    path: ctx.params,
  })

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

  const body = (await ctx.request.json('10kb')) as SendMessageRequest
  validateRequestContract(ctx, 'POST:/api/v1/my/messages/:conversationId/messages', {
    path: ctx.params,
    body,
  })
  // The schema fixes the type; a whitespace-only message is a semantic rejection.
  ctx.assert(body.text.trim().length > 0, 400, 'text is required')

  const message = await createConversationMessage(currentUser.id, conversationId, body.text)

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
  validateRequestContract(ctx, 'GET:/api/v1/my/messages/:conversationId/participants', {
    path: ctx.params,
  })

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
