import type { PrivateUser } from '@services/users/types'
import {
  HOSTED_CHAT_MODEL_BY_PROVIDER,
  type HostedChatModelProvider,
} from '@services/agents/model-providers'
import { runToolLoopStreaming, type RunToolLoopResult } from '@agents/_shared'
import { claimChatConversationMessageAgenticRun } from '@services/conversations-messages/create'
import { finalizeChatAgenticRun } from '@services/conversations-messages'
import { clearConversationLastResponseIdIfMatches } from '@services/conversations-messages/conversations'
import type { Conversation } from '@services/conversations-messages/types'
import { buildChatInput } from './build-input.mts'
import { ANTHROPIC_TOOL_FREE_SYSTEM_PROMPT } from './build-system-prompt.mts'
import { checkMessageSafety } from './safety.mts'
import { streamAnthropicChat } from './anthropic-stream.mts'
import { streamOpenAIToolLoop } from './openai-tool-loop-stream.mts'
import onError from '@modules/on-error'
import type { ChatStreamEvent } from './stream-types.mts'
import { getEmptyResponseFallbackMessage } from './empty-response-fallback.mts'
import { handleChatStreamError } from './handle-stream-error.mts'
import { isOpenAIMissingPreviousResponseError } from '@modules/openai-utils/create-response'
export type { ChatStreamEvent } from './stream-types.mts'

interface StreamChatResponseDeps {
  checkMessageSafety?: typeof checkMessageSafety
  runToolLoopStreaming?: typeof runToolLoopStreaming
  streamAnthropicChat?: typeof streamAnthropicChat
  buildChatInput?: typeof buildChatInput
}
export async function* streamChatResponse(params: {
  conversation: Conversation
  conversationMessageId: string
  userMessage: string
  currentUser: PrivateUser
  modelProvider?: HostedChatModelProvider
  signal?: AbortSignal
  deps?: StreamChatResponseDeps
}): AsyncGenerator<ChatStreamEvent> {
  const {
    conversation,
    conversationMessageId,
    userMessage,
    currentUser,
    modelProvider = 'openai',
    signal,
    deps = {},
  } = params
  const checkSafety = deps.checkMessageSafety ?? checkMessageSafety
  const runLoopStreaming = deps.runToolLoopStreaming ?? runToolLoopStreaming
  const streamAnthropic = deps.streamAnthropicChat ?? streamAnthropicChat
  const buildInput = deps.buildChatInput ?? buildChatInput
  const conversationId = conversation.id
  const modelName = HOSTED_CHAT_MODEL_BY_PROVIDER[modelProvider]
  const agenticRun = await claimChatConversationMessageAgenticRun({
    conversationId,
    conversationMessageId,
    modelName,
    modelProvider,
    input: { message: userMessage },
  })
  if (!agenticRun) return
  let fullResponse = ''
  let result: RunToolLoopResult | undefined

  try {
    await checkSafety(userMessage)
    const initialPreviousResponseId: string | undefined =
      modelProvider === 'openai' ? (conversation.last_response_id ?? undefined) : undefined
    let previousResponseId = initialPreviousResponseId
    let input = await buildInput(
      conversationId,
      userMessage,
      previousResponseId === undefined ? 'full-history' : 'current-turn',
    )
    let emittedUserVisibleEvent = false
    let recoveryAttempted = false

    while (true) {
      const gen =
        modelProvider === 'anthropic'
          ? streamAnthropic({ systemPrompt: ANTHROPIC_TOOL_FREE_SYSTEM_PROMPT, input, signal })
          : streamOpenAIToolLoop({
              conversationId,
              conversationMessageId,
              agenticRunId: agenticRun.id,
              currentUser,
              previousResponseId,
              input,
              signal,
              runLoopStreaming,
            })

      try {
        let step = await gen.next()
        while (!step.done) {
          const ev = step.value
          emittedUserVisibleEvent = true
          switch (ev.type) {
            case 'tool_call':
            case 'tool_result':
            case 'subagent_step':
            case 'subagent_text': {
              yield ev
              break
            }
            case 'text': {
              fullResponse += ev.content
              yield ev
              break
            }
          }
          step = await gen.next()
        }

        result = modelProvider === 'openai' ? step.value : undefined
        break
      } catch (error) {
        const canRecover =
          modelProvider === 'openai' &&
          initialPreviousResponseId !== undefined &&
          previousResponseId === initialPreviousResponseId &&
          !recoveryAttempted &&
          !emittedUserVisibleEvent &&
          isOpenAIMissingPreviousResponseError(error)
        if (!canRecover) throw error

        recoveryAttempted = true
        const cleared = await clearConversationLastResponseIdIfMatches(
          conversationId,
          initialPreviousResponseId,
        )
        if (!cleared) throw error

        previousResponseId = undefined
        input = await buildInput(conversationId, userMessage, 'full-history')
      }
    }

    if (!fullResponse) {
      if (result?.terminationReason === 'no_tool_calls' || modelProvider === 'anthropic') {
        onError(
          new Error(
            modelProvider === 'anthropic'
              ? 'chat: anthropic stream ended with no extractable text'
              : 'chat: no_tool_calls exit with no extractable text',
          ),
        )
      }
      fullResponse = getEmptyResponseFallbackMessage(modelProvider, result?.terminationReason)
      yield { type: 'text', content: fullResponse }
    }

    const termination =
      result?.terminationReason === 'max_iterations' ? 'max_iterations' : 'no_tool_calls'
    const finalized = await finalizeChatAgenticRun({
      id: agenticRun.id,
      conversationId,
      conversationMessageId,
      content: fullResponse,
      terminationReason: termination,
      conversationLastResponseId:
        modelProvider === 'openai' ? (result?.lastResponseId ?? null) : null,
    })
    if (finalized) yield { type: 'done' }
  } catch (error) {
    const event = await handleChatStreamError(error, {
      agenticRunId: agenticRun.id,
      conversationId,
      conversationMessageId,
      fullResponse,
      modelProvider,
      signal,
    })
    if (event) yield event
  }
}
