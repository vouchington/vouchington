import { hasActiveChatTurnByConversationId } from '@services/conversations-messages/agentic-runs'
import { apiResponse } from '../../../response-contract.mts'
import {
  getErrorStatus,
  getErrorResponseMessage,
  getErrorResponseCode,
} from '../../../error-response.mts'
import type { Context } from '@jongleberry/api-server'
import {
  normalizeFixedClientGeneratedChatModelName,
  parseClientGeneratedChatModelProvider,
} from '@services/agents/model-providers'
import { currentUserCanUpdateConversation } from '@services/conversations-messages/authorization'
import { ChatTurnConflictError } from '@services/conversations-messages/chat-turns'
import { getConversationByIdForMutation } from '@services/conversations-messages/conversations'
import {
  createClientGeneratedChatTurn,
  getClientGeneratedChatTurnReplay,
  ClientGeneratedTurnIdentityConflictError,
} from '@services/conversations-messages/client-generated-chat'
import { toMessageTranscript } from '@services/conversations-messages/transcript'
import { assertNotSuspended } from '@services/users'
import app from '../../../app.mts'
import {
  requireAuth,
  validateRequestContract,
  validateUUIDParam,
} from '../../../response-helpers.mts'
import { checkApiMessageSafety } from '../../check-api-message-safety.mts'

const MAX_MESSAGE_LENGTH = 32_768
const MAX_ASSISTANT_CONTENT_LENGTH = 65_536
const MAX_MODEL_NAME_LENGTH = 256

app
  .route('/api/v1/conversations/:conversationId/client-generated-chat')
  .post(async (ctx: Context) => {
    let currentUser: Awaited<ReturnType<typeof requireAuth>>
    try {
      currentUser = await requireAuth(
        ctx,
        'POST:/api/v1/conversations/:conversationId/client-generated-chat',
      )
    } catch (error) {
      if (
        getErrorStatus(error) !== 401 ||
        getErrorResponseMessage(error, 401) !== 'Unauthorized' ||
        getErrorResponseCode(error, 401) !== undefined
      )
        throw error
      ctx.setStatus(401)
      ctx.json(
        apiResponse(
          'POST:/api/v1/conversations/:conversationId/client-generated-chat#unauthorized',
          { message: 'Unauthorized' },
        ),
      )
      return
    }
    assertNotSuspended(currentUser)

    const conversationId = validateUUIDParam(ctx, 'conversationId')
    validateRequestContract(
      ctx,
      'POST:/api/v1/conversations/:conversationId/client-generated-chat',
      { path: ctx.params },
    )
    const conversation = await getConversationByIdForMutation(conversationId)
    if (!conversation) ctx.throw(404, 'Conversation not found')
    if (!(await currentUserCanUpdateConversation(currentUser, conversation))) {
      ctx.setStatus(403)
      ctx.json(
        apiResponse('POST:/api/v1/conversations/:conversationId/client-generated-chat#forbidden', {
          message: 'Access denied',
        }),
      )
      return
    }

    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    validateRequestContract(
      ctx,
      'POST:/api/v1/conversations/:conversationId/client-generated-chat',
      { body },
    )
    const userMessageId = body.user_message_id
    const assistantMessageId = body.assistant_message_id
    const messageIdPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
    ctx.assert(
      typeof userMessageId === 'string' && messageIdPattern.test(userMessageId),
      400,
      'user_message_id must be a lowercase UUIDv7',
    )
    ctx.assert(
      typeof assistantMessageId === 'string' && messageIdPattern.test(assistantMessageId),
      400,
      'assistant_message_id must be a lowercase UUIDv7',
    )
    ctx.assert(
      userMessageId < assistantMessageId,
      400,
      'Message ids must follow user then assistant order',
    )
    const message = body.message
    const assistantContent = body.assistant_content
    ctx.assert(typeof message === 'string', 400, 'Message must be a string')
    ctx.assert(message.trim().length > 0, 400, 'Message cannot be empty')
    ctx.assert(
      message.length <= MAX_MESSAGE_LENGTH,
      400,
      `Message must be at most ${MAX_MESSAGE_LENGTH} characters`,
    )
    ctx.assert(typeof assistantContent === 'string', 400, 'assistant_content must be a string')
    ctx.assert(assistantContent.trim().length > 0, 400, 'assistant_content cannot be empty')
    ctx.assert(
      assistantContent.length <= MAX_ASSISTANT_CONTENT_LENGTH,
      400,
      `assistant_content must be at most ${MAX_ASSISTANT_CONTENT_LENGTH} characters`,
    )

    let modelProvider: ReturnType<typeof parseClientGeneratedChatModelProvider>
    try {
      modelProvider = parseClientGeneratedChatModelProvider(body.model_provider)
    } catch (error) {
      ctx.throw(
        400,
        error instanceof Error ? error.message : 'Invalid client-generated chat provider',
      )
    }

    let modelName: string
    if (modelProvider === 'openai_compatible') {
      ctx.assert(typeof body.model_name === 'string', 400, 'model_name must be a string')
      modelName = body.model_name.trim()
      ctx.assert(modelName.length > 0, 400, 'model_name cannot be empty')
      ctx.assert(
        modelName.length <= MAX_MODEL_NAME_LENGTH,
        400,
        `model_name must be at most ${MAX_MODEL_NAME_LENGTH} characters`,
      )
    } else {
      try {
        modelName = normalizeFixedClientGeneratedChatModelName(modelProvider, body.model_name)
      } catch (error) {
        ctx.throw(400, error instanceof Error ? error.message : 'Invalid model_name')
      }
    }

    const params = {
      conversationId,
      userMessageId,
      assistantMessageId,
      createdById: currentUser.id,
      message,
      assistantContent,
      modelProvider,
      modelName,
    }
    let result: Awaited<ReturnType<typeof createClientGeneratedChatTurn>>
    try {
      const replay = await getClientGeneratedChatTurnReplay(params)
      if (replay) {
        result = replay
      } else {
        const isRunning = await hasActiveChatTurnByConversationId(conversationId)
        ctx.assert(!isRunning, 409, 'A message is already being processed')
        await checkApiMessageSafety(message)
        await checkApiMessageSafety(assistantContent)
        result = await createClientGeneratedChatTurn(params)
      }
    } catch (error) {
      if (
        error instanceof ChatTurnConflictError ||
        error instanceof ClientGeneratedTurnIdentityConflictError
      ) {
        ctx.setStatus(409)
        ctx.json(
          apiResponse('POST:/api/v1/conversations/:conversationId/client-generated-chat#conflict', {
            message: error.message,
          }),
        )
        return
      }
      throw error
    }

    ctx.json({
      user_message: toMessageTranscript(result.userMessage),
      assistant_message: toMessageTranscript(result.assistantMessage),
      turn: {
        user_message_id: result.userMessage.id,
        assistant_message_id: result.assistantMessage.id,
      },
    })
  })
