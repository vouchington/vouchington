import { beforeEach, expect, it, vi, describe } from 'vitest'

import { callOpenAIAutotagger } from '../openai-autotagger.mts'
import { QUEUED_BACKGROUND_RETRY_POLICY } from '@agents/_shared'

import type { BasicUser } from '@services/users/types'

const autotaggerUser: BasicUser = {
  __entity_type: 'user',
  id: 'user-1',
  username: 'autotagger',
  roles: [],
}

describe('openai-autotagger basic', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('deduplicates topic additions', async () => {
    const addRelatedTopicExecute = vi.fn<VitestLooseMock>().mockResolvedValue({
      success: true,
      topic_id: 'topic-1',
      topic_name: 'Topic 1',
    })
    const runToolLoop = vi.fn<VitestLooseMock>().mockImplementation(async config => {
      const [tool] = config.tools as Array<{ schema: { name: string } }>
      expect(tool.schema.name).toBe('search_topics')
      const addTool = config.tools.find(
        (entry: { schema: { name: string } }) => entry.schema.name === 'add_related_topic',
      ) as {
        executor: (args: { topic_id: string }) => Promise<unknown>
      }
      const firstResult = await addTool.executor({ topic_id: 'topic-1' })
      await config.onAfterCall?.(
        { name: 'add_related_topic', call_id: 'call-1' } as never,
        firstResult,
      )
      const secondResult = await addTool.executor({ topic_id: 'topic-1' })
      await config.onAfterCall?.(
        { name: 'add_related_topic', call_id: 'call-2' } as never,
        secondResult,
      )
      return {
        text: null,
        iterations: 1,
        terminationReason: 'no_tool_calls',
      }
    })

    const result = await callOpenAIAutotagger(
      autotaggerUser,
      'post',
      'post-1',
      'hello world',
      undefined,
      {
        runToolLoop,
        agentTools: [
          {
            schema: { name: 'search_topics', type: 'function', strict: null },
            executor: vi.fn<VitestLooseMock>(),
          } as never,
          {
            schema: { name: 'add_related_topic', type: 'function', strict: null },
            executor: addRelatedTopicExecute,
          } as never,
        ],
        getConversationById: vi.fn<VitestLooseMock>(),
        createConversationMessageAgenticRun: vi.fn<VitestLooseMock>(),
        updateConversationMessageAgenticRunOutput: vi.fn<VitestLooseMock>(),
        updateConversationMessageAgenticRunError: vi.fn<VitestLooseMock>(),
        createRunEventWriter: vi.fn<VitestLooseMock>().mockReturnValue(vi.fn<VitestLooseMock>()),
      },
    )

    expect(addRelatedTopicExecute).toHaveBeenCalledTimes(2)
    expect(result.topics_added).toEqual([{ id: 'topic-1', name: 'Topic 1' }])
  })

  it('passes QUEUED_BACKGROUND_RETRY_POLICY.maxRetries into the runToolLoop config', async () => {
    const runToolLoop = vi.fn<VitestLooseMock>().mockResolvedValue({
      text: null,
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await callOpenAIAutotagger(autotaggerUser, 'post', 'post-1', 'hello world', undefined, {
      runToolLoop,
      agentTools: [],
      getConversationById: vi.fn<VitestLooseMock>(),
      createConversationMessageAgenticRun: vi.fn<VitestLooseMock>(),
      updateConversationMessageAgenticRunOutput: vi.fn<VitestLooseMock>(),
      updateConversationMessageAgenticRunError: vi.fn<VitestLooseMock>(),
      createRunEventWriter: vi.fn<VitestLooseMock>().mockReturnValue(vi.fn<VitestLooseMock>()),
    })

    expect(runToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({ maxRetries: QUEUED_BACKGROUND_RETRY_POLICY.maxRetries }),
    )
    expect(QUEUED_BACKGROUND_RETRY_POLICY.maxRetries).toBe(2)
  })

  it('curries entity type and id into the tool function', async () => {
    const addRelatedTopicExecute = vi.fn<VitestLooseMock>().mockResolvedValue({
      success: true,
      topic_id: 'topic-1',
      topic_name: 'Topic 1',
    })
    const runToolLoop = vi.fn<VitestLooseMock>().mockImplementation(async config => {
      const addTool = config.tools.find(
        (entry: { schema: { name: string } }) => entry.schema.name === 'add_related_topic',
      ) as {
        executor: (args: { topic_id: string }) => Promise<unknown>
      }
      await addTool.executor({ topic_id: 'topic-1' })
      return {
        text: null,
        iterations: 1,
        terminationReason: 'no_tool_calls',
      }
    })

    await callOpenAIAutotagger(autotaggerUser, 'post', 'post-1', 'hello world', undefined, {
      runToolLoop,
      agentTools: [
        {
          schema: { name: 'search_topics', type: 'function', strict: null },
          executor: vi.fn<VitestLooseMock>(),
        } as never,
        {
          schema: { name: 'add_related_topic', type: 'function', strict: null },
          executor: addRelatedTopicExecute,
        } as never,
      ],
      getConversationById: vi.fn<VitestLooseMock>(),
      createConversationMessageAgenticRun: vi.fn<VitestLooseMock>(),
      updateConversationMessageAgenticRunOutput: vi.fn<VitestLooseMock>(),
      updateConversationMessageAgenticRunError: vi.fn<VitestLooseMock>(),
      createRunEventWriter: vi.fn<VitestLooseMock>().mockReturnValue(vi.fn<VitestLooseMock>()),
    })

    expect(addRelatedTopicExecute).toHaveBeenCalledWith({ topic_id: 'topic-1' })
  })

  it('persists run error when OpenAI call fails with conversation context', async () => {
    const getConversationById = vi.fn<VitestLooseMock>().mockResolvedValue({
      id: 'conversation-1',
      created_by_id: 'user-1',
    })
    const createConversationMessageAgenticRun = vi.fn<VitestLooseMock>().mockResolvedValue({
      id: 'run-1',
    })
    const updateConversationMessageAgenticRunError = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(undefined)
    const runToolLoop = vi.fn<VitestLooseMock>().mockRejectedValue(new Error('OpenAI failed'))
    const noopExecutor = vi.fn<VitestLooseMock>()

    await expect(
      callOpenAIAutotagger(
        autotaggerUser,
        'post',
        'post-1',
        'hello world',
        {
          conversationId: 'conversation-1',
          conversationMessageId: 'message-1',
        },
        {
          runToolLoop,
          agentTools: [
            {
              schema: { name: 'search_topics', type: 'function', strict: null },
              executor: noopExecutor,
            } as never,
            {
              schema: { name: 'add_related_topic', type: 'function', strict: null },
              executor: noopExecutor,
            } as never,
          ],
          getConversationById,
          createConversationMessageAgenticRun,
          updateConversationMessageAgenticRunOutput: vi.fn<VitestLooseMock>(),
          updateConversationMessageAgenticRunError,
          createRunEventWriter: vi.fn<VitestLooseMock>().mockReturnValue(vi.fn<VitestLooseMock>()),
        },
      ),
    ).rejects.toThrow('OpenAI failed')

    expect(createConversationMessageAgenticRun).toHaveBeenCalledWith({
      conversationId: 'conversation-1',
      conversationMessageId: 'message-1',
      modelName: 'openai/gpt-5.4-nano',
      modelProvider: 'openrouter',
      input: { content: 'hello world' },
    })
    expect(updateConversationMessageAgenticRunError).toHaveBeenCalledWith(
      'run-1',
      expect.objectContaining({ message: 'OpenAI failed', name: 'Error' }),
      'error',
    )
  })

  it('includes seeded topics section when seeded_topics provided', async () => {
    const runToolLoop = vi.fn<VitestLooseMock>().mockResolvedValue({
      text: null,
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })

    await callOpenAIAutotagger(
      autotaggerUser,
      'post',
      'post-1',
      'hello world',
      {
        seeded_topics: [{ id: 'topic-seeded', name: 'Seeded Topic' }],
      },
      {
        runToolLoop,
        agentTools: [
          {
            schema: { name: 'search_topics', type: 'function', strict: null },
            executor: vi.fn<VitestLooseMock>(),
          } as never,
          {
            schema: { name: 'add_related_topic', type: 'function', strict: null },
            executor: vi.fn<VitestLooseMock>(),
          } as never,
        ],
        getConversationById: vi.fn<VitestLooseMock>(),
        createConversationMessageAgenticRun: vi.fn<VitestLooseMock>(),
        updateConversationMessageAgenticRunOutput: vi.fn<VitestLooseMock>(),
        updateConversationMessageAgenticRunError: vi.fn<VitestLooseMock>(),
        createRunEventWriter: vi.fn<VitestLooseMock>().mockReturnValue(vi.fn<VitestLooseMock>()),
      },
    )

    expect(runToolLoop).toHaveBeenCalledWith(
      expect.objectContaining({
        input: expect.stringContaining('Seeded Topic'),
      }),
    )
  })
})
