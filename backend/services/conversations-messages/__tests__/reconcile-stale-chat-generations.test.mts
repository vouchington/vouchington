import { describe, expect, it } from 'vitest'
import { createTestUser, setChatAgenticRunStartedAt } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
  createConversationMessageAgenticRun,
  finalizeChatAgenticRun,
  getConversationById,
  getConversationMessageAgenticRunsByConversationMessageId,
  getConversationMessagesByConversationId,
  updateConversationLastResponseId,
} from '../index.mts'
import {
  CHAT_RUNTIME_GENERATION_INTERRUPTED_ERROR,
  getStaleChatRuntimeGenerationJobs,
  reconcileStaleChatRuntimeGenerations,
} from '../reconcile-stale-chat-generations.mts'

describe('reconcileStaleChatRuntimeGenerations', () => {
  it('selects a bounded stable batch of stale top-level chat runs', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Stale chat batch')
    const messages = await Promise.all(
      ['first', 'second', 'fresh'].map(content =>
        createConversationMessage(conversation.id, user.id, { role: 'assistant', content }),
      ),
    )
    const runs = await Promise.all(
      messages.map(message =>
        createConversationMessageAgenticRun({
          conversationId: conversation.id,
          conversationMessageId: message.id,
          modelName: 'gpt-5.4-nano',
          modelProvider: 'openai',
          input: {},
        }),
      ),
    )
    await Promise.all([
      setChatAgenticRunStartedAt(runs[0]!.id, new Date('1900-01-01T00:00:00Z')),
      setChatAgenticRunStartedAt(runs[1]!.id, new Date('1900-01-01T00:00:01Z')),
    ])

    const batch = await getStaleChatRuntimeGenerationJobs({ batchSize: 1 })

    expect(batch.candidates).toEqual([
      {
        id: runs[0]!.id,
        signalJobId: `chat_${messages[0]!.id}`,
        startedAt: new Date('1900-01-01T00:00:00Z'),
      },
    ])
  })

  it('signals only selected stale rows and atomically terminalizes their run and assistant message', async () => {
    const user = await createTestUser()
    const conversation = await createConversation(user.id, 'Stale chat recovery')
    const staleMessage = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: 'partial',
    })
    const freshMessage = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })
    const staleRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: staleMessage.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    const freshRun = await createConversationMessageAgenticRun({
      conversationId: conversation.id,
      conversationMessageId: freshMessage.id,
      modelName: 'gpt-5.4-nano',
      modelProvider: 'openai',
      input: {},
    })
    await setChatAgenticRunStartedAt(staleRun.id, new Date('1900-01-01T00:00:00Z'))

    await expect(
      reconcileStaleChatRuntimeGenerations({
        cutoff: new Date('2000-01-01T00:00:00Z'),
        candidates: [
          {
            id: staleRun.id,
            signalJobId: `chat_${staleMessage.id}`,
            startedAt: new Date('1900-01-01T00:00:00Z'),
          },
        ],
      }),
    ).resolves.toEqual({ chats: 1 })

    await expect(
      getConversationMessageAgenticRunsByConversationMessageId(staleMessage.id),
    ).resolves.toMatchObject([{ status: 'failed' }])
    await expect(
      getConversationMessageAgenticRunsByConversationMessageId(freshMessage.id),
    ).resolves.toMatchObject([{ id: freshRun.id, status: 'running' }])
    await expect(getConversationMessagesByConversationId(conversation.id)).resolves.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: staleMessage.id,
          content: {
            role: 'assistant',
            content: 'partial',
            error: CHAT_RUNTIME_GENERATION_INTERRUPTED_ERROR,
          },
        }),
      ]),
    )
  })

  it('clears a stale non-OpenAI cursor without overwriting a completed run cursor', async () => {
    const user = await createTestUser()
    const staleConversation = await createConversation(user.id, 'Stale Anthropic cursor')
    const completedConversation = await createConversation(user.id, 'Completed Anthropic cursor')
    const staleMessage = await createConversationMessage(staleConversation.id, user.id, {
      role: 'assistant',
      content: 'partial',
    })
    const completedMessage = await createConversationMessage(completedConversation.id, user.id, {
      role: 'assistant',
      content: 'completed',
    })
    const staleRun = await createConversationMessageAgenticRun({
      conversationId: staleConversation.id,
      conversationMessageId: staleMessage.id,
      modelName: 'claude-sonnet-5',
      modelProvider: 'anthropic',
      input: {},
    })
    const completedRun = await createConversationMessageAgenticRun({
      conversationId: completedConversation.id,
      conversationMessageId: completedMessage.id,
      modelName: 'claude-sonnet-5',
      modelProvider: 'anthropic',
      input: {},
    })
    await Promise.all([
      setChatAgenticRunStartedAt(staleRun.id, new Date('1900-01-01T00:00:00Z')),
      setChatAgenticRunStartedAt(completedRun.id, new Date('1900-01-01T00:00:00Z')),
      updateConversationLastResponseId(staleConversation.id, 'response_stale'),
    ])
    await expect(
      finalizeChatAgenticRun({
        id: completedRun.id,
        conversationId: completedConversation.id,
        conversationMessageId: completedMessage.id,
        content: 'completed',
        terminationReason: 'no_tool_calls',
      }),
    ).resolves.toBe(true)
    await updateConversationLastResponseId(completedConversation.id, 'response_newer')

    await reconcileStaleChatRuntimeGenerations({
      cutoff: new Date('2000-01-01T00:00:00Z'),
      candidates: [
        {
          id: staleRun.id,
          signalJobId: `chat_${staleMessage.id}`,
          startedAt: new Date('1900-01-01T00:00:00Z'),
        },
        {
          id: completedRun.id,
          signalJobId: `chat_${completedMessage.id}`,
          startedAt: new Date('1900-01-01T00:00:00Z'),
        },
      ],
    })

    await expect(getConversationById(staleConversation.id)).resolves.toMatchObject({
      last_response_id: null,
    })
    await expect(getConversationById(completedConversation.id)).resolves.toMatchObject({
      last_response_id: 'response_newer',
    })
  })
})
