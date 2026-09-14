import { it, expect, vi, beforeEach, describe } from 'vitest'

import { runToolLoop, type RunToolLoopConfig } from '../run-tool-loop.mts'

import type { RunEventWriter } from '@services/conversations-messages'
import type { AgentTool } from '@services/openai-agents'
import {
  makeTextResponse,
  makeToolCallResponse,
  makeToolCall,
} from '../../../test-helpers/agents/_shared/run-tool-loop-test-helpers.mts'

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

describe('run-tool-loop core', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('returns text when model produces no tool calls on first iteration', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(makeTextResponse('Hello world'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    const result = await runToolLoop({
      ...baseConfig,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.text).toBe('Hello world')
    expect(result.iterations).toBe(1)
    expect(result.terminationReason).toBe('no_tool_calls')
    expect(createOpenAIResponse).toHaveBeenCalledTimes(1)
    expect(executeToolCalls).not.toHaveBeenCalled()
  })

  it('executes tool calls and loops until no more tool calls', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
      .mockResolvedValueOnce(makeTextResponse('Final answer'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValueOnce({ toolResults: [] })

    const result = await runToolLoop({
      ...baseConfig,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.text).toBe('Final answer')
    expect(result.iterations).toBe(2)
    expect(result.terminationReason).toBe('no_tool_calls')
    expect(executeToolCalls).toHaveBeenCalledTimes(1)
  })

  it('stops at maxIterations and makes a final tool_choice:none call', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse('resp-1'))
      .mockResolvedValueOnce(makeToolCallResponse('resp-2'))
      .mockResolvedValueOnce(makeToolCallResponse('resp-3'))
      .mockResolvedValueOnce(makeTextResponse('fallback answer', 'resp-4'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValue({ toolResults: [] })

    const result = await runToolLoop({
      ...baseConfig,
      maxIterations: 3,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.terminationReason).toBe('max_iterations')
    expect(result.text).toBe('fallback answer')
    expect(result.iterations).toBe(4)
    expect(createOpenAIResponse).toHaveBeenCalledTimes(4)
    const finalCall = createOpenAIResponse.mock.calls[3][0] as Record<string, unknown>
    expect(finalCall.tool_choice).toBe('none')
  })

  it('passes extraParams to createOpenAIResponse', async () => {
    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockResolvedValue(makeTextResponse('ok'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    await runToolLoop({
      ...baseConfig,
      extraParams: { service_tier: 'flex', prompt_cache_key: 'test-v1' },
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const callParams = createOpenAIResponse.mock.calls[0][0] as Record<string, unknown>
    expect(callParams.service_tier).toBe('flex')
    expect(callParams.prompt_cache_key).toBe('test-v1')
  })

  it('falls back to original input for final tool_choice:none call when toolResults is empty', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
      .mockResolvedValueOnce(makeTextResponse('final'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValue({ toolResults: [] })

    await runToolLoop({
      ...baseConfig,
      maxIterations: 1,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const finalCall = createOpenAIResponse.mock.calls[1][0] as Record<string, unknown>
    expect(finalCall.input).toBe(baseConfig.input)
    expect(finalCall.tool_choice).toBe('none')
  })

  it('sends toolResults (not original input) for final tool_choice:none call when tools returned results', async () => {
    const toolResultOutput = {
      type: 'function_call_output',
      call_id: 'call-1',
      output: '{"result": "data"}',
    }

    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
      .mockResolvedValueOnce(makeTextResponse('final'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce({ toolResults: [toolResultOutput] })

    await runToolLoop({
      ...baseConfig,
      maxIterations: 1,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const finalCall = createOpenAIResponse.mock.calls[1][0] as Record<string, unknown>
    expect(finalCall.input).toEqual([toolResultOutput])
    expect(finalCall.tool_choice).toBe('none')
  })

  it('returns null text when model produces empty response', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue({ id: 'resp-empty', output: [] })
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    const result = await runToolLoop({
      ...baseConfig,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.text).toBeNull()
    expect(result.terminationReason).toBe('no_tool_calls')
  })

  it('calls custom onCallError when provided', async () => {
    const onCallError = vi.fn<VitestLooseMock>()
    const toolError = new Error('tool failed')
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
      .mockResolvedValueOnce(makeTextResponse('recovered'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executeToolCalls = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(({ onCallError: cb }) => {
        cb?.(makeToolCall(), toolError)
        return Promise.resolve({ toolResults: [] })
      })

    await runToolLoop({
      ...baseConfig,
      onCallError,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(onCallError).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'search_posts' }),
      toolError,
    )
  })

  it('passes safetyIdentifier to each createOpenAIResponse call', async () => {
    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockResolvedValue(makeTextResponse('ok'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    await runToolLoop({
      ...baseConfig,
      safetyIdentifier: 'custom-id-123',
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const callParams = createOpenAIResponse.mock.calls[0][0] as Record<string, unknown>
    expect(callParams.safety_identifier).toBe('custom-id-123')
  })

  it('chains previous_response_id across iterations', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse('resp-iter-1'))
      .mockResolvedValueOnce(makeTextResponse('done', 'resp-iter-2'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValueOnce({ toolResults: [] })

    await runToolLoop({
      ...baseConfig,
      previousResponseId: 'resp-seed',
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const firstCall = createOpenAIResponse.mock.calls[0][0] as Record<string, unknown>
    expect(firstCall.previous_response_id).toBe('resp-seed')

    const secondCall = createOpenAIResponse.mock.calls[1][0] as Record<string, unknown>
    expect(secondCall.previous_response_id).toBe('resp-iter-1')
  })

  it('returns lastResponseId in result', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(makeTextResponse('ok', 'resp-final'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    const result = await runToolLoop({
      ...baseConfig,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.lastResponseId).toBe('resp-final')
  })
  // keep generated shard bindings live for typecheck
  const keepRunEventWriter: RunEventWriter | null = null
  void (0 as unknown as typeof keepRunEventWriter)
  const keepOnIteration: OnIteration | null = null
  void (0 as unknown as typeof keepOnIteration)
})
