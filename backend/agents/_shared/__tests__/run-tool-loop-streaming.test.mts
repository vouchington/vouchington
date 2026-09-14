import { it, expect, vi, beforeEach, describe } from 'vitest'

import { runToolLoopStreaming, type RunToolLoopStreamEvent } from '../run-tool-loop-streaming.mts'

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

async function* makeToolResultStream() {
  yield* []
  return makeToolResult()
}

describe('run-tool-loop-streaming', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('yields text delta then model_response when model produces no tool calls', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeTextStream('Hello world', makeTextResponse('Hello world')))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])

    const { events, returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        deps: { streamOpenAIResponse: streamResponse, getFunctionCallsFromOutput },
      }),
    )

    expect(events[0]).toEqual({ type: 'text', content: 'Hello world' })
    expect(events[1]).toMatchObject({ type: 'model_response', iteration: 1, tool_calls_count: 0 })
    expect(events).toHaveLength(2)
    expect(returnValue).toMatchObject({
      text: 'Hello world',
      iterations: 1,
      terminationReason: 'no_tool_calls',
    })
  })

  it('yields model_response → tool_call → tool_result → text → model_response for one tool call', async () => {
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

    const { events, returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    expect(events[0]).toMatchObject({ type: 'model_response', iteration: 1, tool_calls_count: 1 })
    expect(events[1]).toMatchObject({ type: 'tool_call', call_id: 'call-1', name: 'search_posts' })
    expect(events[2]).toMatchObject({ type: 'tool_result', call_id: 'call-1' })
    expect(events[3]).toEqual({ type: 'text', content: 'Final answer' })
    expect(events[4]).toMatchObject({ type: 'model_response', iteration: 2, tool_calls_count: 0 })
    expect(events).toHaveLength(5)
    expect(returnValue).toMatchObject({
      text: 'Final answer',
      iterations: 2,
      terminationReason: 'no_tool_calls',
    })
  })

  it('passes subagent_step events through between tool_call and tool_result', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
      .mockImplementationOnce(makeTextStream('done', makeTextResponse('done', 'resp-2')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(async function* () {
      yield { type: 'subagent_step', agent_name: 'research', tool_name: 'search_web' } as never
      return makeToolResult()
    })

    const { events } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    const types = events.map(e => e.type)
    expect(types).toContain('tool_call')
    expect(types).toContain('subagent_step')
    expect(types).toContain('tool_result')

    const toolCallIdx = types.indexOf('tool_call')
    const subagentIdx = types.indexOf('subagent_step')
    const toolResultIdx = types.indexOf('tool_result')
    expect(toolCallIdx).toBeLessThan(subagentIdx)
    expect(subagentIdx).toBeLessThan(toolResultIdx)
    expect(events[subagentIdx]).toMatchObject({
      type: 'subagent_step',
      agent_name: 'research',
      tool_name: 'search_web',
      tool_call_id: 'call-1',
    })
  })

  it('passes subagent_text events through with the parent tool call id', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
      .mockImplementationOnce(makeTextStream('done', makeTextResponse('done', 'resp-2')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(async function* () {
      yield { type: 'subagent_text', agent_name: 'research', content: 'Checking sources' } as never
      return makeToolResult()
    })

    const { events } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    expect(events).toContainEqual({
      type: 'subagent_text',
      agent_name: 'research',
      content: 'Checking sources',
      tool_call_id: 'call-1',
    })
  })

  it('yields fallback model_response and text delta at max_iterations', async () => {
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

    const { events, returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        maxIterations: 1,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    const modelResponseEvents = events.filter(e => e.type === 'model_response')
    expect(modelResponseEvents).toHaveLength(2)
    expect(modelResponseEvents[1]).toMatchObject({
      type: 'model_response',
      iteration: 2,
      tool_calls_count: 0,
    })
    const textEvent = events.find(e => e.type === 'text')
    expect(textEvent).toEqual({ type: 'text', content: 'fallback' })
    const textIdx = events.indexOf(textEvent!)
    const finalModelResponseIdx = events.indexOf(modelResponseEvents[1] as RunToolLoopStreamEvent)
    expect(textIdx).toBeLessThan(finalModelResponseIdx)
    expect(returnValue).toMatchObject({ terminationReason: 'max_iterations', iterations: 2 })
  })

  it('throws when signal is already aborted before first iteration', async () => {
    const controller = new AbortController()
    controller.abort()

    const gen = runToolLoopStreaming({
      ...baseConfig,
      signal: controller.signal,
      deps: {
        streamOpenAIResponse: vi.fn<VitestLooseMock>(),
        getFunctionCallsFromOutput: vi.fn<VitestLooseMock>(),
        dispatchOneToolCall: vi.fn<VitestLooseMock>(),
      },
    })
    await expect(gen.next()).rejects.toThrow(Error)
  })

  it('onIteration { stop: true } terminates and yields no text when response has no extractable text', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(makeToolResultStream)

    const { events, returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        onIteration: () => ({ stop: true, reason: 'custom_stop' }),
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
        },
      }),
    )

    expect(returnValue).toMatchObject({ terminationReason: 'custom_stop', iterations: 1 })
    expect(events.some(e => e.type === 'text')).toBe(false)
    expect(events[0]).toMatchObject({ type: 'model_response', iteration: 1 })
  })

  it('onIteration { stop: true } yields text delta when response streams text', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(
        makeTextStream('early exit text', makeTextResponse('early exit text', 'resp-1')),
      )
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])

    const { events, returnValue } = await drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        onIteration: () => ({ stop: true, reason: 'early_exit' }),
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall: vi.fn<VitestLooseMock>(),
        },
      }),
    )

    expect(returnValue).toMatchObject({ terminationReason: 'early_exit' })
    expect(events).toContainEqual({ type: 'text', content: 'early exit text' })
  })
})
