import { describe, expect, it, vi } from 'vitest'
import { runToolLoop } from '../run-tool-loop.mts'
import { makeTextResponse } from '../../../test-helpers/agents/_shared/run-tool-loop-test-helpers.mts'

describe('runToolLoop OpenRouter transport', () => {
  it('uses the injected OpenRouter transport while preserving tool-loop request fields', async () => {
    const createOpenRouterResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValue(makeTextResponse('OpenRouter response'))
    const createOpenAIResponse = vi.fn<VitestLooseMock>()
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([])

    const result = await runToolLoop({
      model: 'openai/gpt-5.4-nano',
      responseProvider: 'openrouter',
      tools: [],
      input: 'Summarize this.',
      maxIterations: 1,
      safetyIdentifier: 'story-123',
      extraParams: { prompt_cache_key: 'autotagger-v1' },
      deps: { createOpenRouterResponse, createOpenAIResponse, getFunctionCallsFromOutput },
    })

    expect(result.text).toBe('OpenRouter response')
    expect(createOpenRouterResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-5.4-nano',
        input: 'Summarize this.',
        safety_identifier: 'story-123',
        prompt_cache_key: 'autotagger-v1',
      }),
      expect.anything(),
    )
    expect(createOpenAIResponse).not.toHaveBeenCalled()
  })
})
