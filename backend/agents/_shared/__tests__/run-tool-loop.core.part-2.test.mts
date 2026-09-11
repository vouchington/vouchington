import { it, expect, vi, beforeEach, describe } from 'vitest'
import { runToolLoop, type RunToolLoopConfig } from '../run-tool-loop.mts'
import type { RunEventWriter } from '@services/conversations-messages'
import type { AgentTool } from '@services/openai-agents'
import {
  makeTextResponse,
  makeToolCallResponse,
  makeToolCall,
} from '../test-helpers/run-tool-loop-test-helpers.mts'

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

  it('forwards metadata to createOpenAIResponse', async () => {
    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockResolvedValue(makeTextResponse('ok'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    await runToolLoop({
      ...baseConfig,
      metadata: { type: 'test_agent', entity_id: 'abc-123' },
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const callParams = createOpenAIResponse.mock.calls[0][0] as Record<string, unknown>
    expect(callParams.metadata).toEqual({ type: 'test_agent', entity_id: 'abc-123' })
  })

  it('onIteration can stop the loop with a custom reason', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse('resp-1'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    const onIteration = vi
      .fn<OnIteration>()
      .mockReturnValueOnce({ stop: true, reason: 'max_recommendations' })

    const result = await runToolLoop({
      ...baseConfig,
      onIteration,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.terminationReason).toBe('max_recommendations')
    expect(result.iterations).toBe(1)
    expect(executeToolCalls).not.toHaveBeenCalled()
  })

  it('passes onBeforeCall and onAfterCall through to executeToolCalls', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
      .mockResolvedValueOnce(makeTextResponse('done'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValueOnce({ toolResults: [] })

    const onBeforeCall = vi.fn<VitestLooseMock>().mockReturnValue(undefined)
    const onAfterCall = vi.fn<VitestLooseMock>()

    await runToolLoop({
      ...baseConfig,
      onBeforeCall,
      onAfterCall,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const executeCallArgs = executeToolCalls.mock.calls[0][0]
    expect(executeCallArgs.onBeforeCall).toBe(onBeforeCall)
    expect(executeCallArgs.onAfterCall).toBe(onAfterCall)
  })

  it('onIteration reason takes precedence over no_tool_calls when fired with zero tool calls', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeTextResponse('done'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])
    const executeToolCalls = vi.fn<VitestLooseMock>()

    const onIteration = vi
      .fn<OnIteration>()
      .mockReturnValueOnce({ stop: true, reason: 'max_recommendations' })

    const result = await runToolLoop({
      ...baseConfig,
      onIteration,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(result.terminationReason).toBe('max_recommendations')
    expect(executeToolCalls).not.toHaveBeenCalled()
  })

  it('passes writeRunEvent through to executeToolCalls', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
      .mockResolvedValueOnce(makeTextResponse('done'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValueOnce({ toolResults: [] })

    const writeRunEvent = vi.fn<RunEventWriter>()

    await runToolLoop({
      ...baseConfig,
      writeRunEvent,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    const executeCallArgs = executeToolCalls.mock.calls[0][0]
    expect(executeCallArgs.writeRunEvent).toBe(writeRunEvent)
  })

  it('passes maxRetries through to createOpenAIResponse options on the main loop call', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeTextResponse('ok'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])

    await runToolLoop({
      ...baseConfig,
      maxRetries: 5,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput },
    })

    expect(createOpenAIResponse.mock.calls[0]?.[1]).toMatchObject({ maxRetries: 5 })
  })

  it('passes maxRetries through to createOpenAIResponse options on the max_iterations fallback call', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse('resp-1'))
      .mockResolvedValueOnce(makeTextResponse('fallback'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValueOnce({ toolResults: [] })

    await runToolLoop({
      ...baseConfig,
      maxIterations: 1,
      maxRetries: 5,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput, executeToolCalls },
    })

    expect(createOpenAIResponse.mock.calls[1]?.[1]).toMatchObject({ maxRetries: 5 })
  })

  it('passes maxRetries as undefined to createOpenAIResponse when not configured', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeTextResponse('ok'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValueOnce([])

    await runToolLoop({
      ...baseConfig,
      deps: { createOpenAIResponse, getFunctionCallsFromOutput },
    })

    const options = createOpenAIResponse.mock.calls[0]?.[1] as Record<string, unknown>
    expect(options.maxRetries).toBeUndefined()
    expect('maxRetries' in options).toBe(true)
  })
})
