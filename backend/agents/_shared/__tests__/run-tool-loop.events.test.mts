import { it, expect, vi, beforeEach, describe } from 'vitest'
import { runToolLoop, type RunToolLoopConfig } from '../run-tool-loop.mts'
import type { RunEventWriter } from '@services/conversations-messages'
import type { AgentTool } from '@services/openai-agents'
import {
  makeTextResponse,
  makeToolCallResponse,
  makeToolCall,
} from '../test-helpers/run-tool-loop-test-helpers.mts'

type OnAfterIteration = NonNullable<RunToolLoopConfig['onAfterIteration']>
type OnIteration = NonNullable<RunToolLoopConfig['onIteration']>

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

describe('run-tool-loop events and callbacks', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('writes a model_response event per iteration with rich payload', async () => {
    const toolResponse = makeToolCallResponse('resp-tool')
    const textResponse = makeTextResponse('done', 'resp-text')
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(toolResponse)
      .mockResolvedValueOnce(textResponse)
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValueOnce({ toolResults: [] })

    const writeRunEvent = vi.fn<RunEventWriter>().mockResolvedValue(undefined)

    await runToolLoop({
      ...baseConfig,
      writeRunEvent,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const modelResponseCalls = writeRunEvent.mock.calls.filter(c => c[0] === 'model_response')
    expect(modelResponseCalls).toHaveLength(2)
    expect(modelResponseCalls[0][1]).toMatchObject({
      response_id: 'resp-tool',
      iteration: 1,
      tool_calls_count: 1,
    })
    expect(modelResponseCalls[0][2]).toBe(toolResponse.output)
    expect(modelResponseCalls[1][1]).toMatchObject({
      response_id: 'resp-text',
      iteration: 2,
      tool_calls_count: 0,
    })
    expect(modelResponseCalls[1][2]).toBe(textResponse.output)
  })

  it('writes a model_response event for the fallback tool_choice:none call', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse('resp-1'))
      .mockResolvedValueOnce(makeTextResponse('fallback', 'resp-fallback'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValue({ toolResults: [] })
    const writeRunEvent = vi.fn<RunEventWriter>().mockResolvedValue(undefined)

    const result = await runToolLoop({
      ...baseConfig,
      maxIterations: 1,
      writeRunEvent,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.terminationReason).toBe('max_iterations')
    expect(result.iterations).toBe(2)
    const modelResponseCalls = writeRunEvent.mock.calls.filter(c => c[0] === 'model_response')
    expect(modelResponseCalls).toHaveLength(2)
    const fallbackEvent = modelResponseCalls[1][1] as Record<string, unknown>
    expect(fallbackEvent.response_id).toBe('resp-fallback')
    expect(fallbackEvent.iteration).toBe(2)
    expect(fallbackEvent.tool_calls_count).toBe(0)
  })

  it('onAfterIteration can stop the loop with a custom reason', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse('resp-1'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValueOnce({ toolResults: [] })

    const onAfterIteration = vi
      .fn<OnAfterIteration>()
      .mockReturnValueOnce({ stop: true, reason: 'max_topics' })

    const result = await runToolLoop({
      ...baseConfig,
      onAfterIteration,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.terminationReason).toBe('max_topics')
    expect(result.iterations).toBe(1)
    expect(createOpenAIResponse).toHaveBeenCalledTimes(1)
  })

  it('onAfterIteration receives toolResults from executeToolCalls', async () => {
    const toolResult = { type: 'function_call_output', call_id: 'call-1', output: '{"ok":true}' }
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
      .mockResolvedValueOnce(makeTextResponse('done'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executeToolCalls = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce({ toolResults: [toolResult] })

    const onAfterIteration = vi.fn<OnAfterIteration>().mockReturnValue(undefined)

    await runToolLoop({
      ...baseConfig,
      onAfterIteration,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(onAfterIteration).toHaveBeenCalledWith(
      expect.objectContaining({ toolResults: [toolResult] }),
    )
  })

  it('onAfterIteration is not called when toolCalls.length === 0 (no_tool_calls exit)', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeTextResponse('done'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    const onAfterIteration = vi.fn<OnAfterIteration>()

    await runToolLoop({
      ...baseConfig,
      onAfterIteration,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(onAfterIteration).not.toHaveBeenCalled()
  })

  it('onAfterIteration is not called when onIteration already stopped the loop', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    const onIteration = vi.fn<OnIteration>().mockReturnValueOnce({ stop: true, reason: 'stalled' })
    const onAfterIteration = vi.fn<OnAfterIteration>()

    await runToolLoop({
      ...baseConfig,
      onIteration,
      onAfterIteration,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(onAfterIteration).not.toHaveBeenCalled()
  })
})
