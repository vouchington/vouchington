import type { Context } from '@jongleberry/api-server'
import { parseHostedChatModelProvider } from '@services/agents/model-providers'
import { hasActiveChatTurnByConversationId } from '@services/conversations-messages/agentic-runs'
import { currentUserCanUpdateConversation } from '@services/conversations-messages/authorization'
import {
  ChatTurnConflictError,
  createHostedChatTurn,
} from '@services/conversations-messages/chat-turns'
import { getConversationByIdForMutation } from '@services/conversations-messages/conversations'
import { failChatEnqueue, updateConversationMessageContent } from '@services/conversations-messages'
import { assertNotSuspended } from '@services/users'
import { enqueueChat, getChatJobId } from '@queues/ai-agents/enqueues/chat'
import { ai_agents } from '@queues/ai-agents/queues'
import { type ChatTokenSubscription, subscribeChatTokens } from '@data-stores/valkey-pubsub'
import app from '../../../app.mts'
import {
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../../response-helpers.mts'
import {
  acquireDuringSSECycle,
  MAX_SSE_CYCLE_DURATION_MS,
  startSSE,
} from '../../../sse-helpers.mts'
import { persistAndReportFailedChatEnqueue, pipeChatTokensToSSE } from './shared.mts'
import { checkApiMessageSafety } from '../../check-api-message-safety.mts'

const PRE_ENQUEUE_DISCONNECT_ERROR =
  'The response could not start because the connection ended. Please try again.'

app.route('/api/v1/conversations/:conversationId/chat').post(async (ctx: Context) => {
  const currentUser = await requireAuth(ctx, 'POST:/api/v1/conversations/:conversationId/chat')
  assertNotSuspended(currentUser)

  const conversationId = validateUUIDParam(ctx, 'conversationId')
  validateRequestContract(ctx, 'POST:/api/v1/conversations/:conversationId/chat', {
    path: ctx.params,
  })

  // Verify conversation exists and user owns it
  const conversation = await getConversationByIdForMutation(conversationId)
  if (!conversation) {
    ctx.throw(404, 'Conversation not found')
  }
  if (!(await currentUserCanUpdateConversation(currentUser, conversation))) {
    ctx.throw(403, 'Access denied')
  }

  // Prevent concurrent messages from corrupting the response chain
  const isRunning = await hasActiveChatTurnByConversationId(conversationId)
  ctx.assert(!isRunning, 409, 'A message is already being processed')

  const body = (await ctx.request.json('1mb')) as Record<string, unknown>
  validateRequestContract(ctx, 'POST:/api/v1/conversations/:conversationId/chat', { body })
  const rawMessage = body.message
  let modelProvider: ReturnType<typeof parseHostedChatModelProvider>
  try {
    modelProvider = parseHostedChatModelProvider(body.provider)
  } catch (error) {
    ctx.throw(400, error instanceof Error ? error.message : 'Invalid chat provider')
  }
  ctx.assert(typeof rawMessage === 'string', 400, 'Message must be a string')
  const message = rawMessage as string
  ctx.assert(message.trim().length > 0, 400, 'Message cannot be empty')
  const MAX_MESSAGE_LENGTH = 32_768
  ctx.assert(
    message.length <= MAX_MESSAGE_LENGTH,
    400,
    `Message must be at most ${MAX_MESSAGE_LENGTH} characters`,
  )

  // Check for prompt injection and content violations
  await checkApiMessageSafety(message)

  let chatTurn: Awaited<ReturnType<typeof createHostedChatTurn>>
  try {
    chatTurn = await createHostedChatTurn({
      conversationId,
      createdById: currentUser.id,
      message,
    })
  } catch (error) {
    /* v8 ignore start -- concurrent conflict after the route guard is service DB-tested */
    if (error instanceof ChatTurnConflictError) {
      ctx.throw(409, error.message)
    }
    throw error
    /* v8 ignore stop */
  }
  const { userMessage, assistantMessage } = chatTurn

  const { stream, pipelinePromise, lifecycleSignal } = startSSE(ctx, {
    cycleDurationMs: MAX_SSE_CYCLE_DURATION_MS,
  })
  const chatJobId = getChatJobId(assistantMessage.id)
  if (!lifecycleSignal.aborted) {
    stream.write(
      `event: metadata\ndata: ${JSON.stringify({
        conversation_id: conversationId,
        user_message_id: userMessage.id,
        assistant_message_id: assistantMessage.id,
        job_id: chatJobId,
      })}\n\n`,
    )
  }

  let subscription: ChatTokenSubscription | undefined
  let closeSubscription: (() => Promise<void>) | undefined
  try {
    try {
      // Subscribe BEFORE enqueuing — pub/sub drops messages published before a subscriber
      // attaches. Channel keyed by assistantMessage.id (= job.data.conversationMessageId).
      const acquiredSubscription = await acquireDuringSSECycle(lifecycleSignal, () =>
        subscribeChatTokens(assistantMessage.id),
      )
      /* v8 ignore next 8 -- the disconnect-during-acquisition race is covered by the SSE acquisition helper */
      if (!acquiredSubscription) {
        await updateConversationMessageContent(conversationId, assistantMessage.id, {
          role: 'assistant',
          content: null,
          error: PRE_ENQUEUE_DISCONNECT_ERROR,
        })
        return
      }
      subscription = acquiredSubscription.resource
      closeSubscription = acquiredSubscription.close

      await enqueueChat({
        conversationId,
        conversationMessageId: assistantMessage.id,
        userMessageId: userMessage.id,
        userMessage: message,
        userId: currentUser.id,
        modelProvider,
      })
    } catch {
      /* v8 ignore start -- requires failing the internal queue singleton; predicate recovery is DB-tested */
      const routeWon = await persistAndReportFailedChatEnqueue({
        queue: ai_agents,
        jobId: chatJobId,
        persistFailure: error =>
          failChatEnqueue({
            conversationId,
            conversationMessageId: assistantMessage.id,
            error,
          }),
        write: data => stream.write(data),
        disconnectSignal: lifecycleSignal,
      })
      if (!routeWon && subscription) {
        await pipeChatTokensToSSE({
          subscription,
          jobId: chatJobId,
          write: data => stream.write(data),
          queue: ai_agents,
          disconnectSignal: lifecycleSignal,
        })
      }
      return
      /* v8 ignore stop */
    }

    await pipeChatTokensToSSE({
      subscription,
      jobId: chatJobId,
      write: data => stream.write(data),
      queue: ai_agents,
      disconnectSignal: lifecycleSignal,
    })
  } finally {
    stream.end()
    await closeSubscription?.()
    await pipelinePromise
  }
})
