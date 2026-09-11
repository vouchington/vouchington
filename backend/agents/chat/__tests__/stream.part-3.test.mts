import { describe, it, expect, vi, beforeEach } from 'vitest'
import { streamChatResponse } from '../stream.mts'

import { createTestUser } from '@voucha/test-helpers'

import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'

import { getConversationMessageAgenticRunsByConversationMessageId } from '@services/conversations-messages/agentic-runs'

import type { PrivateUser } from '@services/users/types'

import type { RunToolLoopResult } from '../../_shared/run-tool-loop.mts'

import type { RunToolLoopStreamEvent } from '../../_shared/run-tool-loop-streaming.mts'

function makeRunner(events: RunToolLoopStreamEvent[], result: RunToolLoopResult) {
  return vi.fn<VitestLooseMock>().mockImplementation(async function* () {
    for (const ev of events) yield ev
    return result
  })
}

describe('streamChatResponse', () => {
  let testUser: PrivateUser

  beforeEach(async () => {
    const user = await createTestUser()
    if (!user) throw new Error('Failed to create test user')
    testUser = user
    vi.clearAllMocks()
  })

  it('fails closed on malformed stored history before calling OpenAI', async () => {
    const conversation = await createConversation(testUser.id, 'Malformed history failure')
    await createConversationMessage(conversation.id, testUser.id, {
      role: 'system',
      content: 'sensitive malformed content',
    })
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })
    const runToolLoopStreaming = vi.fn<VitestLooseMock>()

    const events = []
    for await (const event of streamChatResponse({
      conversation,
      conversationMessageId: message.id,
      userMessage: 'Current question',
      currentUser: testUser,
      deps: {
        checkMessageSafety: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
        runToolLoopStreaming,
      },
    })) {
      events.push(event)
    }

    expect(runToolLoopStreaming).not.toHaveBeenCalled()
    expect(events).toEqual([
      { type: 'error', error: 'Stored chat history contains an invalid message' },
    ])
    expect(JSON.stringify(events)).not.toContain('sensitive')

    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
    expect(runs[0]).toMatchObject({
      status: 'failed',
      error: { error: 'Stored chat history contains an invalid message' },
    })
  })

  it('uses an Anthropic-specific fallback when the stream is empty', async () => {
    const conversation = await createConversation(testUser.id, 'Anthropic Empty Stream')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    const streamAnthropicChat = vi.fn<VitestLooseMock>().mockImplementation(async function* () {})
    const checkMessageSafety = vi.fn<VitestLooseMock>().mockResolvedValue(undefined)
    const buildChatInput = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue([{ role: 'user', content: 'full conversation history' }])

    const events = []
    for await (const event of streamChatResponse({
      conversation,
      conversationMessageId: message.id,
      userMessage: 'Use Claude',
      currentUser: testUser,
      modelProvider: 'anthropic',
      deps: { checkMessageSafety, streamAnthropicChat, buildChatInput },
    })) {
      events.push(event)
    }

    expect(events).toContainEqual({
      type: 'text',
      content: "Sorry, Claude couldn't generate a response. Please try rephrasing your question.",
    })
    expect(events).toContainEqual({ type: 'done' })

    const runs = await getConversationMessageAgenticRunsByConversationMessageId(message.id)
    expect(runs[0]).toMatchObject({
      model_provider: 'anthropic',
      termination_reason: 'no_tool_calls',
      output: {
        response:
          "Sorry, Claude couldn't generate a response. Please try rephrasing your question.",
      },
    })
  })

  it('should pass abort signal to runToolLoopStreaming', async () => {
    const conversation = await createConversation(testUser.id, 'Abort Signal Test')
    const message = await createConversationMessage(conversation.id, testUser.id, {
      role: 'assistant',
      content: null,
    })

    const runToolLoopStreaming = makeRunner([{ type: 'text', content: 'Response' }], {
      text: 'Response',
      iterations: 1,
      terminationReason: 'no_tool_calls',
      lastResponseId: 'response_123',
    })

    const controller = new AbortController()

    for await (const _ of streamChatResponse({
      conversation,
      conversationMessageId: message.id,
      userMessage: 'Test message',
      currentUser: testUser,
      signal: controller.signal,
      deps: {
        checkMessageSafety: vi.fn<VitestLooseMock>().mockResolvedValue(undefined),
        runToolLoopStreaming,
      },
    })) {
      // drain
    }

    expect(runToolLoopStreaming).toHaveBeenCalledWith(
      expect.objectContaining({
        signal: controller.signal,
      }),
    )
  })
})
