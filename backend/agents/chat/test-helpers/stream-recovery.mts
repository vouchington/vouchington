import { vi } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import {
  getConversationById,
  updateConversationLastResponseId,
} from '@services/conversations-messages/conversations'
import type { Conversation } from '@services/conversations-messages/types'
import type { PrivateUser } from '@services/users/types'
import type { RunToolLoopResult } from '../../_shared/run-tool-loop.mts'
import { streamChatResponse, type ChatStreamEvent } from '../stream.mts'
import { OpenAIResponseStreamError } from '@modules/openai-utils/create-response'

interface Scenario {
  conversation: Conversation
  currentUser: PrivateUser
  messageId: string
}

export async function createScenario(
  title: string,
  lastResponseId?: string,
  withHistory = false,
): Promise<Scenario> {
  const currentUser = await createTestUser()
  const createdConversation = await createConversation(currentUser.id, title)
  if (withHistory) {
    await createConversationMessage(createdConversation.id, currentUser.id, {
      role: 'user',
      content: 'Earlier question',
    })
    await createConversationMessage(createdConversation.id, currentUser.id, {
      role: 'assistant',
      content: 'Earlier answer',
    })
  }
  if (lastResponseId) {
    await updateConversationLastResponseId(createdConversation.id, lastResponseId)
  }
  const conversation = (await getConversationById(createdConversation.id))!
  const message = await createConversationMessage(conversation.id, currentUser.id, {
    role: 'assistant',
    content: null,
  })
  return { conversation, currentUser, messageId: message.id }
}

export async function collectEvents(
  scenario: Scenario,
  runToolLoopStreaming: VitestLooseMock,
): Promise<ChatStreamEvent[]> {
  const events: ChatStreamEvent[] = []
  for await (const event of streamChatResponse({
    conversation: scenario.conversation,
    conversationMessageId: scenario.messageId,
    userMessage: 'Continue',
    currentUser: scenario.currentUser,
    deps: {
      checkMessageSafety: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
      runToolLoopStreaming,
    },
  })) {
    events.push(event)
  }
  return events
}

export function makeFailingRunner(error: Error): VitestLooseMock {
  return vi.fn<VitestLooseMock>().mockImplementation(async function* () {
    yield* []
    throw error
  })
}

export function makeMissingPreviousResponseError(): Error {
  return suppressLogging(
    new OpenAIResponseStreamError({
      code: 'previous_response_not_found',
      message: 'The previous response expired',
      param: 'previous_response_id',
    }),
  )
}

export function makeResult(lastResponseId: string): RunToolLoopResult {
  return {
    text: 'Recovered answer',
    iterations: 1,
    terminationReason: 'no_tool_calls',
    lastResponseId,
  }
}

export function suppressLogging<T extends Error>(error: T): T {
  return Object.assign(error, { tags: { suppressLogging: true } })
}
