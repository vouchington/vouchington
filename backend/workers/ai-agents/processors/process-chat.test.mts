import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Job } from 'glide-mq'
import type { ChatJobData } from '@queues/ai-agents/types'
import { createSystemUser } from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
  hasActiveChatTurnByConversationId,
} from '@services/conversations-messages'
import { updateConversationMessageContent } from '@services/conversations-messages/update-message'
import { processChat, type ProcessChatDeps } from './process-chat.mts'
import type { ChatStreamEvent } from '@agents/chat'
import type { Conversation } from '@services/conversations-messages/types'
import type { PrivateUser } from '@services/users/types'

function mockChatJob(data: ChatJobData): Job<ChatJobData> {
  return {
    data,
    name: 'chat',
    id: crypto.randomUUID(),
    signals: [],
  } as unknown as Job<ChatJobData>
}

function makeJobData(overrides?: Partial<ChatJobData>): ChatJobData {
  return {
    conversationId: crypto.randomUUID(),
    conversationMessageId: crypto.randomUUID(),
    userMessageId: crypto.randomUUID(),
    userMessage: 'Hello',
    userId: crypto.randomUUID(),
    ...overrides,
  }
}

function makeConversation(id: string): Conversation {
  return { id } as Conversation
}

function makePrivateUser(id: string): PrivateUser {
  return { __entity_type: 'user', id, roles: [] } as unknown as PrivateUser
}

describe('process-chat', () => {
  const mockGetConversationById = vi.fn<ProcessChatDeps['getConversationById']>()
  const mockGetPrivateUserByAny = vi.fn<ProcessChatDeps['getPrivateUserByAny']>()
  const mockPublishChatToken = vi.fn<ProcessChatDeps['publishChatToken']>()
  const mockUpdateConversationMessageContent =
    vi.fn<ProcessChatDeps['updateConversationMessageContent']>()

  function runProcessChat(
    job: Job<ChatJobData>,
    streamEvents: ChatStreamEvent[] = [],
    createMarkdownStreamBuffer: ProcessChatDeps['createMarkdownStreamBuffer'] = () => {
      return {
        push(content: string) {
          return [content]
        },
        flush() {
          return ''
        },
      }
    },
    depsOverrides: Partial<ProcessChatDeps> = {},
  ) {
    const streamChatResponse = vi.fn<ProcessChatDeps['streamChatResponse']>(async function* () {
      for (const event of streamEvents) {
        yield event
      }
    })

    return processChat(job, {
      getConversationById: mockGetConversationById,
      getPrivateUserByAny: mockGetPrivateUserByAny,
      publishChatToken: mockPublishChatToken,
      streamChatResponse,
      createMarkdownStreamBuffer,
      updateConversationMessageContent: mockUpdateConversationMessageContent,
      ...depsOverrides,
    })
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockPublishChatToken.mockResolvedValue(undefined)
    mockUpdateConversationMessageContent.mockResolvedValue(undefined)
  })

  it('marks the queued assistant message failed when conversation does not exist', async () => {
    mockGetConversationById.mockResolvedValue(null)
    const jobData = makeJobData({
      conversationId: 'conversation-missing',
      conversationMessageId: 'assistant-missing-conversation',
    })

    await runProcessChat(mockChatJob(jobData))

    expect(mockGetPrivateUserByAny).not.toHaveBeenCalled()
    expect(mockPublishChatToken).not.toHaveBeenCalled()
    expect(mockUpdateConversationMessageContent).toHaveBeenCalledWith(
      'conversation-missing',
      'assistant-missing-conversation',
      {
        role: 'assistant',
        content: null,
        error: 'Unable to load conversation for chat response.',
      },
    )
  })

  it('marks the queued assistant message failed when user does not exist', async () => {
    mockGetConversationById.mockResolvedValue(makeConversation('conversation-1'))
    mockGetPrivateUserByAny.mockResolvedValue(null)
    const jobData = makeJobData({
      conversationId: 'conversation-1',
      conversationMessageId: 'assistant-missing-user',
    })

    await runProcessChat(mockChatJob(jobData))

    expect(mockPublishChatToken).not.toHaveBeenCalled()
    expect(mockUpdateConversationMessageContent).toHaveBeenCalledWith(
      'conversation-1',
      'assistant-missing-user',
      {
        role: 'assistant',
        content: null,
        error: 'Unable to load user for chat response.',
      },
    )
  })

  it('clears skipped assistant placeholders when the conversation lookup fails', async () => {
    const random = Math.random().toString(36).slice(2, 10)
    const user = await createSystemUser(`test-user-${random}`)
    const conversation = await createConversation(user.id, 'Conversation lookup failure')
    const assistantMessage = await createConversationMessage(conversation.id, user.id, {
      role: 'assistant',
      content: null,
    })

    await expect(hasActiveChatTurnByConversationId(conversation.id)).resolves.toBe(true)

    mockGetConversationById.mockResolvedValue(null)

    await runProcessChat(
      mockChatJob(
        makeJobData({
          conversationId: conversation.id,
          conversationMessageId: assistantMessage.id,
        }),
      ),
      [],
      undefined,
      {
        updateConversationMessageContent,
      },
    )

    await expect(hasActiveChatTurnByConversationId(conversation.id)).resolves.toBe(false)
    expect(mockPublishChatToken).not.toHaveBeenCalled()
  })

  it('publishes text chunks and done events', async () => {
    mockGetConversationById.mockResolvedValue(makeConversation('conversation-1'))
    mockGetPrivateUserByAny.mockResolvedValue(makePrivateUser('user-1'))

    await runProcessChat(mockChatJob(makeJobData({ conversationMessageId: 'message-1' })), [
      { type: 'text', content: 'Hello world' },
      { type: 'done' },
    ])

    expect(mockPublishChatToken).toHaveBeenCalledWith('message-1', {
      type: 'text',
      content: 'Hello world',
    })
    expect(mockPublishChatToken).toHaveBeenCalledWith('message-1', { type: 'done' })
  })

  it('waits for each text publish before publishing the next chunk', async () => {
    mockGetConversationById.mockResolvedValue(makeConversation('conversation-ordered'))
    mockGetPrivateUserByAny.mockResolvedValue(makePrivateUser('user-ordered'))
    const firstPublish = Promise.withResolvers<void>()
    mockPublishChatToken.mockReturnValueOnce(firstPublish.promise)

    const processPromise = runProcessChat(
      mockChatJob(makeJobData({ conversationMessageId: 'message-ordered' })),
      [{ type: 'text', content: 'first-second' }, { type: 'done' }],
      () => ({
        push: () => ['first', 'second'],
        flush: () => '',
      }),
    )

    await vi.waitFor(() => expect(mockPublishChatToken).toHaveBeenCalledTimes(1))
    expect(mockPublishChatToken).toHaveBeenNthCalledWith(1, 'message-ordered', {
      type: 'text',
      content: 'first',
    })

    firstPublish.resolve()
    await processPromise
    expect(mockPublishChatToken).toHaveBeenNthCalledWith(2, 'message-ordered', {
      type: 'text',
      content: 'second',
    })
    expect(mockPublishChatToken).toHaveBeenNthCalledWith(3, 'message-ordered', { type: 'done' })
  })

  it('flushes buffered markdown before non-text stream events', async () => {
    mockGetConversationById.mockResolvedValue(makeConversation('conversation-buffered'))
    mockGetPrivateUserByAny.mockResolvedValue(makePrivateUser('user-buffered'))

    await runProcessChat(
      mockChatJob(makeJobData({ conversationMessageId: 'message-buffered' })),
      [{ type: 'done' }],
      () => ({
        push: () => [],
        flush: () => 'buffer tail',
      }),
    )

    expect(mockPublishChatToken).toHaveBeenNthCalledWith(1, 'message-buffered', {
      type: 'text',
      content: 'buffer tail',
    })
    expect(mockPublishChatToken).toHaveBeenNthCalledWith(2, 'message-buffered', { type: 'done' })
  })

  it('publishes tool and subagent events', async () => {
    mockGetConversationById.mockResolvedValue(makeConversation('conversation-2'))
    mockGetPrivateUserByAny.mockResolvedValue(makePrivateUser('user-2'))

    await runProcessChat(mockChatJob(makeJobData({ conversationMessageId: 'message-2' })), [
      {
        type: 'tool_call',
        tool_call_id: 'tc-1',
        name: 'search',
        arguments: '{"q":"test"}',
      },
      { type: 'tool_result', tool_call_id: 'tc-2', result: 'some result' },
      { type: 'subagent_step', agent_name: 'researcher', tool_name: 'web_search' },
      {
        type: 'subagent_text',
        agent_name: 'researcher',
        tool_call_id: 'tc-subagent',
        content: 'Checking sources',
      },
      { type: 'error', error: 'boom' },
      { type: 'done' },
    ])

    expect(mockPublishChatToken).toHaveBeenCalledWith('message-2', {
      type: 'tool_call',
      tool_call_id: 'tc-1',
      name: 'search',
      arguments: '{"q":"test"}',
    })
    expect(mockPublishChatToken).toHaveBeenCalledWith('message-2', {
      type: 'tool_result',
      tool_call_id: 'tc-2',
      result: 'some result',
    })
    expect(mockPublishChatToken).toHaveBeenCalledWith('message-2', {
      type: 'subagent_step',
      agent_name: 'researcher',
      tool_name: 'web_search',
    })
    expect(mockPublishChatToken).toHaveBeenCalledWith('message-2', {
      type: 'subagent_text',
      agent_name: 'researcher',
      tool_call_id: 'tc-subagent',
      content: 'Checking sources',
    })
    expect(mockPublishChatToken).toHaveBeenCalledWith('message-2', {
      type: 'error',
      error: 'boom',
    })
  })

  it('resolves when signals array contains non-abort signals', async () => {
    mockGetConversationById.mockResolvedValue(makeConversation('conversation-3'))
    mockGetPrivateUserByAny.mockResolvedValue(makePrivateUser('user-3'))

    await expect(
      runProcessChat(mockChatJob(makeJobData()), [{ type: 'done' }]),
    ).resolves.toBeUndefined()
  })
})
