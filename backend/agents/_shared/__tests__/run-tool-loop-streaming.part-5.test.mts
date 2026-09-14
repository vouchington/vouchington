import { describe, expect, it, vi } from 'vitest'
import type { Response } from 'openai/resources/responses/responses'
import type { AgentTool } from '@services/openai-agents'
import type { latchAccountingUncertainty as latchAccountingUncertaintyFn } from '@services/ai-usage'
import {
  OpenAIResponseNotCompletedError,
  getOpenAIResponseAttemptHooks,
} from '../create-response.mts'
import { recordAgentResponseUsage } from '../record-response-usage.mts'
import { runToolLoopStreaming } from '../run-tool-loop-streaming.mts'
import type { RunToolLoopConfig } from '../run-tool-loop.mts'
import {
  drainRunToolLoopStream,
  makeNoTextStream,
  makeToolCall,
  makeToolCallResponse,
  makeToolResult,
} from '../../../test-helpers/agents/_shared/run-tool-loop-test-helpers.mts'

const tool: AgentTool = {
  schema: { name: 'search_posts', description: 'Search posts', parameters: {} },
  executor: vi.fn<VitestLooseMock>(),
}

const config: RunToolLoopConfig = {
  model: 'gpt-5.4-nano',
  instructions: 'Use tools when needed.',
  tools: [tool],
  input: 'Find a post.',
  maxIterations: 1,
  safetyIdentifier: 'attempt-hooks-test-user',
  agentSlug: 'attempt-hooks-test',
}

async function* toolResultStream() {
  yield* []
  return makeToolResult()
}

function unknownBilledStream(error: Error, requestStartedAt: Date) {
  return async function* (): AsyncGenerator<never, never> {
    yield* []
    const hooks = getOpenAIResponseAttemptHooks()
    if (!hooks) throw new Error('Expected response attempt hooks')
    await hooks.onUnknownBilledAttempt({ requestStartedAt, error })
    throw error
  }
}

describe('runToolLoopStreaming attempt hooks', () => {
  it('settles an unknown billed main-stream attempt before rejecting or dispatching tools', async () => {
    const latchSettled = Promise.withResolvers<void>()
    const latchAccountingUncertainty = vi
      .fn<typeof latchAccountingUncertaintyFn>()
      .mockImplementation(async () => await latchSettled.promise)
    const providerError = new Error('stream disconnected')
    const streamOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementation(unknownBilledStream(providerError, new Date('2026-08-16T12:00:00.000Z')))
    const dispatchOneToolCall = vi.fn<VitestLooseMock>()
    const drain = drainRunToolLoopStream(
      runToolLoopStreaming({
        ...config,
        deps: {
          streamOpenAIResponse,
          dispatchOneToolCall,
          assertOpenAiSpendCapNotBreached: async () => null,
          latchAccountingUncertainty,
        },
      }),
    )
    const drainRejection = drain.catch((error: unknown) => error)

    await vi.waitFor(() => expect(latchAccountingUncertainty).toHaveBeenCalledOnce())
    expect(dispatchOneToolCall).not.toHaveBeenCalled()
    latchSettled.resolve()
    await expect(drainRejection).resolves.toBe(providerError)
    expect(streamOpenAIResponse).toHaveBeenCalledOnce()
  })

  it('settles an unknown billed max-iteration final stream before rejecting', async () => {
    const latchSettled = Promise.withResolvers<void>()
    const latchAccountingUncertainty = vi
      .fn<typeof latchAccountingUncertaintyFn>()
      .mockImplementation(async () => await latchSettled.promise)
    const providerError = new Error('final stream disconnected')
    const streamOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-first')))
      .mockImplementationOnce(
        unknownBilledStream(providerError, new Date('2026-08-16T12:00:00.000Z')),
      )
    const getFunctionCallsFromOutput = vi.fn<VitestLooseMock>().mockReturnValue([makeToolCall()])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(toolResultStream)
    const drain = drainRunToolLoopStream(
      runToolLoopStreaming({
        ...config,
        deps: {
          streamOpenAIResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
          assertOpenAiSpendCapNotBreached: async () => null,
          latchAccountingUncertainty,
          recordAgentResponseUsage: vi
            .fn<typeof recordAgentResponseUsage>()
            .mockResolvedValue(undefined),
        },
      }),
    )
    const drainRejection = drain.catch((error: unknown) => error)

    await vi.waitFor(() => expect(latchAccountingUncertainty).toHaveBeenCalledOnce())
    expect(streamOpenAIResponse).toHaveBeenCalledTimes(2)
    expect(dispatchOneToolCall).toHaveBeenCalledOnce()
    latchSettled.resolve()
    await expect(drainRejection).resolves.toBe(providerError)
  })

  it('records a terminal known-usage error without raising the unknown-billed latch', async () => {
    const terminalError = new OpenAIResponseNotCompletedError('response failed', {
      id: 'resp-terminal',
      status: 'failed',
      model: 'gpt-5.4-nano',
      service_tier: 'flex',
      usage: { input_tokens: 10, output_tokens: 5 },
    } as Response)
    const latchAccountingUncertainty = vi.fn<typeof latchAccountingUncertaintyFn>()
    const recordUsage = vi.fn<typeof recordAgentResponseUsage>().mockResolvedValue(undefined)
    const streamOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementation(async function* (): AsyncGenerator<never, never> {
        yield* []
        throw terminalError
      })

    await expect(
      drainRunToolLoopStream(
        runToolLoopStreaming({
          ...config,
          deps: {
            streamOpenAIResponse,
            assertOpenAiSpendCapNotBreached: async () => null,
            latchAccountingUncertainty,
            recordAgentResponseUsage: recordUsage,
          },
        }),
      ),
    ).rejects.toBe(terminalError)
    expect(recordUsage).toHaveBeenCalledOnce()
    expect(latchAccountingUncertainty).not.toHaveBeenCalled()
  })
})
