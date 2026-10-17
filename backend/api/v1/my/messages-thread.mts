import app from '../../app.mts'
import type { Context } from '@jongleberry/api-server'
import { requireAuth, validateRequestContract } from '../../response-helpers.mts'
import {
  listMyConversationMessages,
  sendMyConversationMessage,
  listMyConversationParticipants,
} from '@services/messaging/my-message-commands'
import { apiQuery } from '../../response-contract.mts'
import { simplePaginationParser } from '@modules/pagination'
type SendMessageRequest = { text: string }

app.route('/api/v1/my/messages/:conversationId/messages').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/messages/:conversationId/messages', simplePaginationParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages/:conversationId/messages')
  const result = await listMyConversationMessages(currentUser, ctx.params, ctx.query, input =>
    validateRequestContract(ctx, 'GET:/api/v1/my/messages/:conversationId/messages', input),
  )
  ctx.json(result)
})

app.route('/api/v1/my/messages/:conversationId/messages').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/my/messages/:conversationId/messages')
  const result = await sendMyConversationMessage(
    currentUser,
    ctx.params,
    async () => (await ctx.request.json('10kb')) as SendMessageRequest,
    input =>
      validateRequestContract(ctx, 'POST:/api/v1/my/messages/:conversationId/messages', input),
  )
  ctx.setStatus(201)
  ctx.json(result)
})

app.route('/api/v1/my/messages/:conversationId/participants').get(async (ctx: Context) => {
  apiQuery('GET:/api/v1/my/messages/:conversationId/participants', simplePaginationParser)
  const currentUser = await requireAuth(ctx, 'GET:/api/v1/my/messages/:conversationId/participants')
  const result = await listMyConversationParticipants(currentUser, ctx.params, ctx.query, input =>
    validateRequestContract(ctx, 'GET:/api/v1/my/messages/:conversationId/participants', input),
  )
  ctx.json(result)
})
