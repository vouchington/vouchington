import { it, expect, vi, beforeEach, describe } from 'vitest'
import { runToolLoop, type RunToolLoopConfig } from '../run-tool-loop.mts'
import type { AgentTool } from '@services/openai-agents'
import {
  makeTextResponse,
  makeToolCallResponse,
  makeToolCall,
} from '../../../test-helpers/agents/_shared/run-tool-loop-fixtures.mts'

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
