import { it, expect, vi, beforeEach, describe } from 'vitest'

import { runToolLoopStreaming } from '../run-tool-loop-streaming.mts'

import type { AgentTool } from '@services/openai-agents'

import type { RunToolLoopConfig } from '../run-tool-loop.mts'
import {
  drainRunToolLoopStream,
  makeNoTextStream,
  makeTextResponse,
  makeTextStream,
  makeToolCall,
  makeToolCallResponse,
  makeToolResult,
} from '../../../test-helpers/agents/_shared/run-tool-loop-test-helpers.mts'

const mockTool: AgentTool = {
  schema: { name: 'search_posts', description: 'Search posts', parameters: {} },
  executor: vi.fn<VitestLooseMock>(),
}

const baseConfig: RunToolLoopConfig = {
  model: 'gpt-5.4-nano',
  instructions: 'You are a helpful assistant.',
  tools: [mockTool],
  input: 'Tell me about credit cards.',
  maxIterations: 3,
  safetyIdentifier: 'test-user-id',
}

type OnBeforeCall = NonNullable<RunToolLoopConfig['onBeforeCall']>

async function* makeToolResultStream() {
  yield* []
  return makeToolResult()
}

describe('run-tool-loop-streaming', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('onAfterIteration { stop: true } terminates without fallback call', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(makeToolResultStream)

    const { returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        onAfterIteration: () => ({ stop: true, reason: 'after_stop' }),
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    expect(returnValue).toMatchObject({ terminationReason: 'after_stop', iterations: 1 })
    expect(streamResponse).toHaveBeenCalledTimes(1)
  })

  it('lastResponseId matches the last response seen', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-iter-1')))
      .mockImplementationOnce(makeTextStream('done', makeTextResponse('done', 'resp-iter-2')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(makeToolResultStream)

    const { returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    expect(returnValue.lastResponseId).toBe('resp-iter-2')
  })

  it('no text event is yielded when tryExtractText returns null (empty response)', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream({ id: 'resp-empty', output: [] } as never))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])

    const { events, returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall: vi.fn<VitestLooseMock>(),
        },
      }),
    )

    expect(events.some(e => e.type === 'text')).toBe(false)
    expect(returnValue).toMatchObject({ text: null, terminationReason: 'no_tool_calls' })
  })

  it('calls onBeforeCall exactly once per tool call even when not skipping', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
      .mockImplementationOnce(makeTextStream('done', makeTextResponse('done', 'resp-2')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(makeToolResultStream)

    const onBeforeCall = vi.fn<OnBeforeCall>().mockReturnValue(undefined)

    await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        onBeforeCall,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    expect(onBeforeCall).toHaveBeenCalledTimes(1)
  })

  it('runs the real dispatchOneToolCall so the memoized onBeforeCall result is invoked', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
      .mockImplementationOnce(makeTextStream('done', makeTextResponse('done', 'resp-2')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executor = vi.fn<VitestLooseMock>().mockResolvedValue({ results: [] })
    const realTool: AgentTool = {
      schema: { name: 'search_posts', description: 'Search posts', parameters: {} },
      executor,
    }
    const onBeforeCall = vi.fn<OnBeforeCall>().mockReturnValue(undefined)

    const { events } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        tools: [realTool],
        onBeforeCall,
        deps: { streamOpenAIResponse: streamResponse, getFunctionCallsFromOutput },
      }),
    )

    expect(executor).toHaveBeenCalledTimes(1)
    expect(events).toContainEqual({
      type: 'tool_result',
      call_id: 'call-1',
      output: JSON.stringify({ results: [] }),
    })
  })

  it('suppresses tool_call and tool_result events when onBeforeCall returns skip', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
      .mockImplementationOnce(
        makeTextStream('Final answer', makeTextResponse('Final answer', 'resp-2')),
      )
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(makeToolResultStream)

    const onBeforeCall = vi
      .fn<OnBeforeCall>()
      .mockReturnValue({ skip: true, skipResult: { skipped: true } })

    const { events, returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        onBeforeCall,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    expect(onBeforeCall).toHaveBeenCalledTimes(1)
    expect(events.some(e => e.type === 'tool_call')).toBe(false)
    expect(events.some(e => e.type === 'tool_result')).toBe(false)
    expect(events).toContainEqual({ type: 'text', content: 'Final answer' })
    expect(returnValue).toMatchObject({ terminationReason: 'no_tool_calls', iterations: 2 })
  })

  it('passes maxRetries through to streamOpenAIResponse options on the main loop call', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeTextStream('Hello world', makeTextResponse('Hello world')))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])

    await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        maxRetries: 5,
        deps: { streamOpenAIResponse: streamResponse, getFunctionCallsFromOutput },
      }),
    )

    expect(streamResponse.mock.calls[0]?.[1]).toMatchObject({ maxRetries: 5 })
  })

  it('omits maxRetries (passes undefined) to streamOpenAIResponse when not configured', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeTextStream('Hello world', makeTextResponse('Hello world')))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])

    await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        deps: { streamOpenAIResponse: streamResponse, getFunctionCallsFromOutput },
      }),
    )

    const options = streamResponse.mock.calls[0]?.[1] as Record<string, unknown>
    expect(options.maxRetries).toBeUndefined()
    expect('maxRetries' in options).toBe(true)
  })

  it('passes maxRetries through to streamOpenAIResponse options on the max_iterations fallback call', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
      .mockImplementationOnce(
        makeTextStream('fallback', makeTextResponse('fallback', 'resp-fallback')),
      )
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(makeToolResultStream)

    await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        maxIterations: 1,
        maxRetries: 5,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    expect(streamResponse.mock.calls[1]?.[1]).toMatchObject({ maxRetries: 5 })
  })
})
