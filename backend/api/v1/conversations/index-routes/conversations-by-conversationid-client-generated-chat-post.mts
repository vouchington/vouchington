import type { Context } from '@jongleberry/api-server'
import {
  normalizeFixedClientGeneratedChatModelName,
  parseClientGeneratedChatModelProvider,
} from '@services/agents/model-providers'
import { hasActiveChatTurnByConversationId } from '@services/conversations-messages/agentic-runs'
import { currentUserCanUpdateConversation } from '@services/conversations-messages/authorization'
import { ChatTurnConflictError } from '@services/conversations-messages/chat-turns'
import { getConversationByIdForMutation } from '@services/conversations-messages/conversations'
import { createClientGeneratedChatTurn } from '@services/conversations-messages/client-generated-chat'
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
    const currentUser = await requireAuth(
      ctx,
      'POST:/api/v1/conversations/:conversationId/client-generated-chat',
    )
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
      ctx.throw(403, 'Access denied')
    }

    const isRunning = await hasActiveChatTurnByConversationId(conversationId)
    ctx.assert(!isRunning, 409, 'A message is already being processed')

    const body = (await ctx.request.json('1mb')) as Record<string, unknown>
    validateRequestContract(
      ctx,
      'POST:/api/v1/conversations/:conversationId/client-generated-chat',
      { body },
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

    await checkApiMessageSafety(message)
    await checkApiMessageSafety(assistantContent)

    let result: Awaited<ReturnType<typeof createClientGeneratedChatTurn>>
    try {
      result = await createClientGeneratedChatTurn({
        conversationId,
        createdById: currentUser.id,
        message,
        assistantContent,
        modelProvider,
        modelName,
      })
    } catch (error) {
      /* v8 ignore start -- concurrent conflict after the route guard is service DB-tested */
      if (error instanceof ChatTurnConflictError) {
        ctx.throw(409, error.message)
      }
      throw error
      /* v8 ignore stop */
    }

    ctx.json({
      user_message: result.userMessage,
      assistant_message: result.assistantMessage,
      agentic_run: result.agenticRun,
    })
  })
