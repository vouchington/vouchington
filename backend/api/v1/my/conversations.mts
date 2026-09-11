import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import {
  getConversationById,
  getConversationsByCreatedById,
  updateConversationTitle,
  softDeleteConversation,
  currentUserCanViewConversation,
  currentUserCanUpdateConversation,
  currentUserCanDeleteConversation,
} from '@services/conversations-messages'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import { requireAuth } from '../../response-helpers.mts'
import { assertNotSuspended } from '@services/users'
import { assertOpenAiSpendCapNotBreached } from '@services/ai-usage'
import {
  getConversationTitleGenerationInput,
  generateChatTitleFromInput,
} from '@agents/chat/generate-title'
import {
  buildPageInfo,
  decodeUuidCursor,
  encodeCursor,
  isSimpleCursor,
  simplePaginationParser,
} from '@modules/pagination'

// GET /api/v1/my/conversations
app.route('/api/v1/my/conversations').get(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/conversations')

  const { after: encodedAfter, limit } = simplePaginationParser.parse(ctx.query)
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isSimpleCursor, 'Invalid conversation cursor')
    : undefined

  const conversations = await getConversationsByCreatedById(currentUser.id, {
    after,
    limit,
  })

  const hasMore = conversations.length > limit
  const results = conversations.slice(0, limit)

  ctx.json({
    results,
    page_info: buildPageInfo(results, {
      hasNextPage: hasMore,
      getCursor: conversation => ({ id: conversation.id }),
    }),
  })
})

// GET /api/v1/my/conversations/:conversationId/messages
app.route('/api/v1/my/conversations/:conversationId/messages').get(async (ctx: Context) => {
  const currentUser = await requireAuth(
    ctx,
    'GET:/api/v1/my/conversations/:conversationId/messages',
  )

  const conversationId = ctx.params.conversationId!
  const conversation = await getConversationById(conversationId)

  if (!conversation) ctx.throw(404, 'Conversation not found')
  if (!(await currentUserCanViewConversation(currentUser, conversation)))
    ctx.throw(403, 'Access denied')

  const { after: encodedAfter, limit } = simplePaginationParser.parse(ctx.query)
  const after = encodedAfter
    ? decodeUuidCursor(encodedAfter, isSimpleCursor, 'Invalid message cursor')
    : undefined
  const messages = await getConversationMessagesByConversationId(conversationId, {
    after,
    limit,
    probeForNextPage: true,
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

// PATCH /api/v1/my/conversations/:conversationId
app.route('/api/v1/my/conversations/:conversationId').patch(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'PATCH:/api/v1/my/conversations/:conversationId')

  const conversationId = ctx.params.conversationId!
  const conversation = await getConversationById(conversationId)

  if (!conversation) ctx.throw(404, 'Conversation not found')
  if (!(await currentUserCanUpdateConversation(currentUser, conversation)))
    ctx.throw(403, 'Access denied')

  const body = (await ctx.request.json('10kb')) as Record<string, unknown>
  ctx.assert(typeof body.title === 'string', 400, 'title is required and must be a string')

  await updateConversationTitle(conversationId, body.title as string, currentUser.id)

  const updated = await getConversationById(conversationId)
  ctx.json({ conversation: updated })
})

// DELETE /api/v1/my/conversations/:conversationId
app.route('/api/v1/my/conversations/:conversationId').delete(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'DELETE:/api/v1/my/conversations/:conversationId')

  const conversationId = ctx.params.conversationId!
  const conversation = await getConversationById(conversationId)

  if (!conversation) ctx.throw(404, 'Conversation not found')
  if (!(await currentUserCanDeleteConversation(currentUser, conversation)))
    ctx.throw(403, 'Access denied')

  await softDeleteConversation(conversationId, currentUser.id)

  ctx.setStatus(204)
})

// POST /api/v1/my/conversations/:conversationId/title
app.route('/api/v1/my/conversations/:conversationId/title').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/conversations/:conversationId/title')

  const conversationId = ctx.params.conversationId!
  const conversation = await getConversationById(conversationId)

  if (!conversation) ctx.throw(404, 'Conversation not found')
  if (!(await currentUserCanUpdateConversation(currentUser, conversation)))
    ctx.throw(403, 'Access denied')
  assertNotSuspended(currentUser)

  if (conversation.title?.trim()) {
    ctx.json({ conversation })
    return
  }

  const titleInput = await getConversationTitleGenerationInput(conversationId)
  let title: string
  if (titleInput === null) {
    // No messages yet -- generateChatTitle's local fallback never calls OpenAI for this case, so
    // enforcing the spend cap here would 429 a request that was always going to be free.
    title = 'New Conversation'
  } else {
    const spendCapBreach = await assertOpenAiSpendCapNotBreached('chat-generate-title')
    ctx.assert(!spendCapBreach, 429, 'Daily OpenAI spend cap reached, try again after UTC midnight')
    title = await generateChatTitleFromInput(titleInput, currentUser.id)
  }

  const updated = await updateConversationTitle(conversationId, title, currentUser.id).then(() =>
    getConversationById(conversationId),
  )
  ctx.json({ conversation: updated })
})
