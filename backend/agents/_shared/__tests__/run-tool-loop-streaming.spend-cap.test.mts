import { describe, expect, it, vi } from 'vitest'
import type { OpenAiSpendCapBreach } from '@services/ai-usage'
import { runToolLoopStreaming } from '../run-tool-loop-streaming.mts'
import type { AgentTool } from '@services/openai-agents'
import type { RunToolLoopConfig } from '../run-tool-loop.mts'
import {
  drainRunToolLoopStream,
  makeNoTextStream,
  makeToolCall,
  makeToolCallResponse,
  makeToolResult,
} from '../test-helpers/run-tool-loop-test-helpers.mts'

// Round-16 regression (#9348): the streaming tool loop's per-iteration spend-cap recheck must
// actually stop it mid-run -- see spend-cap-check.test.mts for the shared helper's own unit
// coverage, and run-tool-loop.spend-cap.test.mts for the plain (non-streaming) loop's equivalent.

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

async function* makeToolResultStream() {
  yield* []
  return makeToolResult()
}

describe('run-tool-loop-streaming spend cap mid-loop recheck', () => {
  it('stops issuing model calls once the recheck reports a breach on a later iteration', async () => {
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(makeToolResultStream)
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

    const drainPromise = drainRunToolLoopStream(
      runToolLoopStreaming({
        ...baseConfig,
        deps: {
          streamOpenAIResponse: streamResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
          assertOpenAiSpendCapNotBreached,
        },
      }),
    )

    await expect(drainPromise).rejects.toMatchObject({
      name: 'OpenAiSpendCapBreachError',
      message: expect.stringContaining('OpenAI spend cap breached'),
      breach,
    })

    expect(assertOpenAiSpendCapNotBreached).toHaveBeenCalledTimes(2)
    // The 1st iteration's stream and tool dispatch ran; the 2nd iteration's stream did not -- the
    // recheck at the top of that iteration threw before streamOpenAIResponse was called again.
    expect(streamResponse).toHaveBeenCalledTimes(1)
    expect(dispatchOneToolCall).toHaveBeenCalledTimes(1)
  })
})
