import { describe, expect, it, vi } from 'vitest'
import type { OpenAiSpendCapBreach } from '@services/ai-usage'
import { runToolLoop, type RunToolLoopConfig } from '../run-tool-loop.mts'
import type { AgentTool } from '@services/openai-agents'
import {
  makeTextResponse,
  makeToolCallResponse,
  makeToolCall,
} from '../test-helpers/run-tool-loop-test-helpers.mts'

// Round-16 regression (#9348): the per-iteration spend-cap recheck must actually stop a tool loop
// mid-run, not just no-op inside assertSpendCapNotBreachedForIteration in isolation -- see
// spend-cap-check.test.mts for the unit-level coverage of that helper's branches.

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
  agentSlug: 'autotagger',
}

describe('run-tool-loop spend cap mid-loop recheck', () => {
  it('stops issuing model calls once the recheck reports a breach on a later iteration', async () => {
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse())
      .mockResolvedValueOnce(makeTextResponse('should never be reached'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValueOnce({ toolResults: [] })
    const breach: OpenAiSpendCapBreach = {
      reason: 'cap_exceeded',
      totalMicrounits: 10_000_000,
      dailyCapMicrounits: 10_000_000,
      day: '2026-08-16',
    }
    const assertOpenAiSpendCapNotBreached = vi
      .fn<(callerName: string) => Promise<OpenAiSpendCapBreach | null>>()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(breach)

    const promise = runToolLoop({
      ...baseConfig,
      deps: {
        createOpenAIResponse,
        getFunctionCallsFromOutput,
        executeToolCalls,
        assertOpenAiSpendCapNotBreached,
      },
    })

    await expect(promise).rejects.toMatchObject({
      name: 'OpenAiSpendCapBreachError',
      message: expect.stringContaining('OpenAI spend cap breached'),
      breach,
    })

    expect(assertOpenAiSpendCapNotBreached).toHaveBeenCalledTimes(2)
    expect(assertOpenAiSpendCapNotBreached).toHaveBeenNthCalledWith(1, 'autotagger')
    expect(assertOpenAiSpendCapNotBreached).toHaveBeenNthCalledWith(2, 'autotagger')
    // The 1st iteration's model call and tool execution ran; the 2nd iteration's model call did
    // not -- the recheck at the top of that iteration threw before callRecordingToolLoopUsage.
    expect(createOpenAIResponse).toHaveBeenCalledTimes(1)
    expect(executeToolCalls).toHaveBeenCalledTimes(1)
  })

  it('skips the recheck entirely when agentSlug is unset, matching the ledger-recording no-op convention', async () => {
    const createOpenAIResponse = vi.fn<VitestLooseMock>().mockResolvedValue(makeTextResponse('ok'))
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([])
    const executeToolCalls = vi.fn<VitestLooseMock>()
    const assertOpenAiSpendCapNotBreached =
      vi.fn<(callerName: string) => Promise<OpenAiSpendCapBreach | null>>()

    const { agentSlug: _unused, ...configWithoutAgentSlug } = baseConfig
    const result = await runToolLoop({
      ...configWithoutAgentSlug,
      deps: {
        createOpenAIResponse,
        getFunctionCallsFromOutput,
        executeToolCalls,
        assertOpenAiSpendCapNotBreached,
      },
    })

    expect(result.text).toBe('ok')
    expect(assertOpenAiSpendCapNotBreached).not.toHaveBeenCalled()
  })
})
