import { describe, expect, it, vi } from 'vitest'
import {
  getConversationById,
  updateConversationLastResponseId,
} from '@services/conversations-messages/conversations'
import { getConversationMessagesByConversationId } from '@services/conversations-messages/messages'
import { getConversationMessageAgenticRunsByConversationMessageId } from '@services/conversations-messages/agentic-runs'
import type { RunToolLoopConfig } from '../../_shared/run-tool-loop.mts'
import type { RunToolLoopStreamEvent } from '../../_shared/run-tool-loop-streaming.mts'
import type { ChatStreamEvent } from '../stream.mts'
import { OpenAIResponseStreamError } from '@modules/openai-utils/create-response'
import {
  collectEvents,
  createScenario,
  makeFailingRunner,
  makeMissingPreviousResponseError,
  makeResult,
  suppressLogging,
} from '../../../test-helpers/agents/chat/stream-recovery.mts'

describe('streamChatResponse OpenAI continuation recovery', () => {
  it('clears a stale cursor and retries once with full typed history', async () => {
    const scenario = await createScenario('Recovery success', 'response-stale', true)
    const runToolLoopStreaming = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(async function* () {
        yield* []
        throw makeMissingPreviousResponseError()
      })
      .mockImplementationOnce(async function* () {
        yield { type: 'tool_call', call_id: 'call-1', name: 'search_posts', arguments: '{}' }
        yield { type: 'tool_result', call_id: 'call-1', output: '{"count":1}' }
        yield { type: 'subagent_step', agent_name: 'research', tool_name: 'search_sources' }
        yield { type: 'subagent_text', agent_name: 'research', content: 'Checked sources' }
        yield { type: 'text', content: 'Recovered answer' }
        return makeResult('response-replacement')
      })

    const events = await collectEvents(scenario, runToolLoopStreaming)

    expect(runToolLoopStreaming).toHaveBeenCalledTimes(2)
    const firstConfig = runToolLoopStreaming.mock.calls[0]![0] as RunToolLoopConfig
    const retryConfig = runToolLoopStreaming.mock.calls[1]![0] as RunToolLoopConfig
    expect(firstConfig.previousResponseId).toBe('response-stale')
    expect(firstConfig.input).toHaveLength(1)
    expect(firstConfig.input[0]).toMatchObject({ role: 'user' })
    expect(retryConfig.previousResponseId).toBeUndefined()
    if (!Array.isArray(retryConfig.input)) throw new TypeError('Expected typed retry history')
    expect(retryConfig.input).toHaveLength(3)
    expect(retryConfig.input.map(item => ('role' in item ? item.role : undefined))).toEqual([
      'user',
      'assistant',
      'user',
    ])
    expect(events).toEqual([
      {
        type: 'tool_call',
        tool_call_id: 'call-1',
        name: 'search_posts',
        arguments: '{}',
      },
      { type: 'tool_result', tool_call_id: 'call-1', result: '{"count":1}' },
      { type: 'subagent_step', agent_name: 'research', tool_name: 'search_sources' },
      { type: 'subagent_text', agent_name: 'research', content: 'Checked sources' },
      { type: 'text', content: 'Recovered answer' },
      { type: 'done' },
    ])
    await expect(getConversationById(scenario.conversation.id)).resolves.toMatchObject({
      last_response_id: 'response-replacement',
    })
    const messages = await getConversationMessagesByConversationId(scenario.conversation.id)
    expect(messages.at(-1)?.content).toEqual({
      role: 'assistant',
      content: 'Recovered answer',
    })
    const runs = await getConversationMessageAgenticRunsByConversationMessageId(scenario.messageId)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      status: 'completed',
      output: { response: 'Recovered answer' },
    })
  })

  it('finalizes once and leaves the cursor cleared when recovery fails', async () => {
    const scenario = await createScenario('Recovery failure', 'response-stale')
    const retryError = suppressLogging(new Error('Recovery request failed'))
    const runToolLoopStreaming = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(async function* () {
        yield* []
        throw makeMissingPreviousResponseError()
      })
      .mockImplementationOnce(async function* () {
        yield* []
        throw retryError
      })

    const events = await collectEvents(scenario, runToolLoopStreaming)

    expect(runToolLoopStreaming).toHaveBeenCalledTimes(2)
    expect(events).toEqual([{ type: 'error', error: retryError.message }])
    await expect(getConversationById(scenario.conversation.id)).resolves.toMatchObject({
      last_response_id: null,
    })
    const messages = await getConversationMessagesByConversationId(scenario.conversation.id)
    expect(messages.at(-1)?.content).toEqual({
      role: 'assistant',
      content: null,
      error: retryError.message,
    })
    const runs = await getConversationMessageAgenticRunsByConversationMessageId(scenario.messageId)
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      status: 'failed',
      error: { error: retryError.message },
    })
  })

  it.each([
    [
      'unrelated structured error',
      () =>
        new OpenAIResponseStreamError({
          code: 'server_error',
          message: 'provider failed',
          param: null,
        }),
    ],
    [
      'message-only lookalike',
      () => new Error('400 previous_response_not_found for previous_response_id'),
    ],
  ])('does not retry a %s', async (_label, makeError) => {
    const scenario = await createScenario('Unrelated recovery error', 'response-stale')
    const error = suppressLogging(makeError())
    const runToolLoopStreaming = makeFailingRunner(error)

    const events = await collectEvents(scenario, runToolLoopStreaming)

    expect(runToolLoopStreaming).toHaveBeenCalledTimes(1)
    expect(events).toEqual([{ type: 'error', error: error.message }])
    await expect(getConversationById(scenario.conversation.id)).resolves.toMatchObject({
      last_response_id: 'response-stale',
    })
  })

  it.each([
    [
      { type: 'text', content: 'partial' },
      { type: 'text', content: 'partial' },
    ],
    [
      { type: 'tool_call', call_id: 'call-1', name: 'search_posts', arguments: '{}' },
      { type: 'tool_call', tool_call_id: 'call-1', name: 'search_posts', arguments: '{}' },
    ],
    [
      { type: 'tool_result', call_id: 'call-1', output: '{}' },
      { type: 'tool_result', tool_call_id: 'call-1', result: '{}' },
    ],
    [
      { type: 'subagent_step', agent_name: 'research', tool_name: 'search_sources' },
      { type: 'subagent_step', agent_name: 'research', tool_name: 'search_sources' },
    ],
    [
      { type: 'subagent_text', agent_name: 'research', content: 'Checking sources' },
      { type: 'subagent_text', agent_name: 'research', content: 'Checking sources' },
    ],
  ] satisfies [RunToolLoopStreamEvent, ChatStreamEvent][])(
    'does not retry after the user-visible event %j',
    async (providerEvent, expectedEvent) => {
      const scenario = await createScenario('Post-event recovery refusal', 'response-stale')
      const error = makeMissingPreviousResponseError()
      const runToolLoopStreaming = vi.fn<VitestLooseMock>().mockImplementation(async function* () {
        yield providerEvent
        throw error
      })

      const events = await collectEvents(scenario, runToolLoopStreaming)

      expect(runToolLoopStreaming).toHaveBeenCalledTimes(1)
      expect(events).toEqual([expectedEvent, { type: 'error', error: error.message }])
      await expect(getConversationById(scenario.conversation.id)).resolves.toMatchObject({
        last_response_id: 'response-stale',
      })
    },
  )

  it('preserves a newer cursor when compare-and-clear does not match', async () => {
    const scenario = await createScenario('Cursor race', 'response-stale')
    const error = makeMissingPreviousResponseError()
    const runToolLoopStreaming = vi.fn<VitestLooseMock>().mockImplementation(async function* () {
      yield* []
      await updateConversationLastResponseId(scenario.conversation.id, 'response-newer')
      throw error
    })

    const events = await collectEvents(scenario, runToolLoopStreaming)

    expect(runToolLoopStreaming).toHaveBeenCalledTimes(1)
    expect(events).toEqual([{ type: 'error', error: error.message }])
    await expect(getConversationById(scenario.conversation.id)).resolves.toMatchObject({
      last_response_id: 'response-newer',
    })
  })

  it('caps repeated missing previous response failures at two attempts', async () => {
    const scenario = await createScenario('Recovery cap', 'response-stale')
    const error = makeMissingPreviousResponseError()
    const runToolLoopStreaming = makeFailingRunner(error)

    const events = await collectEvents(scenario, runToolLoopStreaming)

    expect(runToolLoopStreaming).toHaveBeenCalledTimes(2)
    expect(events).toEqual([{ type: 'error', error: error.message }])
    await expect(getConversationById(scenario.conversation.id)).resolves.toMatchObject({
      last_response_id: null,
    })
  })

  it('does not recover without an initial persisted cursor', async () => {
    const scenario = await createScenario('No initial cursor')
    const error = makeMissingPreviousResponseError()
    const runToolLoopStreaming = makeFailingRunner(error)

    const events = await collectEvents(scenario, runToolLoopStreaming)

    expect(runToolLoopStreaming).toHaveBeenCalledTimes(1)
    expect(events).toEqual([{ type: 'error', error: error.message }])
    await expect(getConversationById(scenario.conversation.id)).resolves.toMatchObject({
      last_response_id: null,
    })
  })
})
