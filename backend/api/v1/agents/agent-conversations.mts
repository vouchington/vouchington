import { streamJsonObject, type Context } from '@jongleberry/api-server'
import app from '../../app.mts'
import { requireAuthAndRateLimit } from '../../response-helpers.mts'
import { currentUserCanViewAgents } from '@services/agents/authorization'
import { getAgentByAny } from '@services/agents/get-by-any'
import { searchAgentConversations } from '@services/agents/conversations'
import { getConversationByIdForAgent } from '@services/conversations-messages/conversations'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import {
  createPaginationParser,
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'
import { currentUserCanViewConversation } from '@services/conversations-messages/authorization'
import { getUserPublicByAnyCachedBatch } from '@services/entity-fetch'
import { indexById } from '@modules/utils'
import { agentMessageCursorScope } from '@services/agents'

const conversationsParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

const messagesParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 50 },
})

// GET /api/v1/agents/:idOrSlug/conversations — List conversations for agent
app.route('/api/v1/agents/:idOrSlug/conversations').get(async (ctx: Context) => {
  await requireAuthAndRateLimit(
    ctx,
    currentUserCanViewAgents,
    'GET:/api/v1/agents/:idOrSlug/conversations',
  )

  const agent = await getAgentByAny(ctx.params.idOrSlug!)
  ctx.assert(agent, 404, 'Agent not found')

  const paginationOptions = conversationsParser.parse(ctx.query)
  const result = await searchAgentConversations(agent.system_user_id, {
    ...paginationOptions,
    user_id: ctx.query.user_id ? String(ctx.query.user_id) : undefined,
    username: ctx.query.username ? String(ctx.query.username) : undefined,
    post_id: ctx.query.post_id ? String(ctx.query.post_id) : undefined,
    post_slug: ctx.query.post_slug ? String(ctx.query.post_slug) : undefined,
    rss_feed_item_id: ctx.query.rss_feed_item_id ? String(ctx.query.rss_feed_item_id) : undefined,
    onlyLinkedToSupportThread: true,
  })

  const creatorIds = [
    ...new Set(result.results.flatMap(c => (c.created_by_id ? [c.created_by_id] : []))),
  ]

  const output: Record<string, unknown> = {
    results: result.results,
    page_info: result.page_info,
    users: creatorIds.length > 0 ? getUserPublicByAnyCachedBatch(creatorIds).then(indexById) : {},
  }

  ctx.setType('json')
  await ctx.pipeline(streamJsonObject(output))
})

// GET /api/v1/agents/:idOrSlug/conversations/:conversationId — Conversation detail
app.route('/api/v1/agents/:idOrSlug/conversations/:conversationId').get(async (ctx: Context) => {
  const currentUser = await requireAuthAndRateLimit(
    ctx,
    currentUserCanViewAgents,
    'GET:/api/v1/agents/:idOrSlug/conversations/:conversationId',
  )

  const agent = await getAgentByAny(ctx.params.idOrSlug!)
  ctx.assert(agent, 404, 'Agent not found')

  const conversation = await getConversationByIdForAgent(
    ctx.params.conversationId!,
    agent.system_user_id,
  )
  ctx.assert(conversation, 404, 'Conversation not found')
  ctx.assert(
    await currentUserCanViewConversation(currentUser, conversation),
    404,
    'Conversation not found',
  )

  const { after: encodedAfter, limit } = messagesParser.parse(ctx.query)
  const cursorScope = agentMessageCursorScope(agent.id, conversation.id)
  const scopedAfter = encodedAfter
    ? decodeScopedUuidCursor(encodedAfter, cursorScope, 'Invalid message cursor')
    : undefined
  const messageCandidates = await getConversationMessagesByConversationId(conversation.id, {
    after: scopedAfter ? { id: scopedAfter.id } : undefined,
    limit,
    probeForNextPage: true,
  })
  const hasMoreMessages = messageCandidates.length > limit
  const messages = hasMoreMessages ? messageCandidates.slice(1) : messageCandidates

  ctx.json({
    conversation,
    results: messages,
    page_info: {
      has_next_page: hasMoreMessages,
      start_cursor: messages.at(-1)
        ? encodeScopedUuidCursor(messages.at(-1)!.id, cursorScope)
        : null,
      end_cursor:
        hasMoreMessages && messages[0] ? encodeScopedUuidCursor(messages[0].id, cursorScope) : null,
    },
  })
})
