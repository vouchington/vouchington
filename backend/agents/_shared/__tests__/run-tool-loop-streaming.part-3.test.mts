import { it, expect, vi, beforeEach, describe } from 'vitest'
import { findAiUsageRecordForAgent, pollUntilNotNull } from '@voucha/test-helpers'

import { runToolLoopStreaming } from '../run-tool-loop-streaming.mts'
import { OpenAIResponseNotCompletedError } from '../create-response.mts'

import type { AgentTool } from '@services/openai-agents'
import type { Response } from 'openai/resources/responses/responses'

import type { RunToolLoopConfig } from '../run-tool-loop.mts'
import {
  drainRunToolLoopStream,
  makeNoTextStream,
  makeThrowingStream,
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

  it('records usage from an incomplete response and rethrows in the main loop', async () => {
    const agentSlug = 'tool-loop-streaming-main-loop-test'
    const error = new OpenAIResponseNotCompletedError(
      'OpenAI response incomplete: max_output_tokens',
      {
        status: 'incomplete',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: { input_tokens: 511, output_tokens: 71 },
        incomplete_details: { reason: 'max_output_tokens' },
      } as Response,
    )
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeThrowingStream(error))

    await expect(
      drainRunToolLoopStream(
        runToolLoopStreaming({
          ...baseConfig,
          agentSlug,
          deps: { streamOpenAIResponse: streamResponse },
        }),
      ),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 511, outputTokens: 71 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.pricing_status).toBe('priced')
  })

  it('records usage from an incomplete response and rethrows in the max_iterations fallback', async () => {
    const agentSlug = 'tool-loop-streaming-final-response-test'
    const error = new OpenAIResponseNotCompletedError(
      'OpenAI response incomplete: max_output_tokens',
      {
        status: 'incomplete',
        model: 'gpt-5.4-nano-2026-03-17',
        service_tier: 'flex',
        usage: { input_tokens: 611, output_tokens: 81 },
        incomplete_details: { reason: 'max_output_tokens' },
      } as Response,
    )
    const streamResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-1')))
      .mockImplementationOnce(makeThrowingStream(error))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(makeToolResultStream)

    await expect(
      drainRunToolLoopStream(
        runToolLoopStreaming({
          ...baseConfig,
          maxIterations: 1,
          agentSlug,
          deps: {
            streamOpenAIResponse: streamResponse,
            getFunctionCallsFromOutput,
            dispatchOneToolCall,
          },
        }),
      ),
    ).rejects.toThrow('OpenAI response incomplete: max_output_tokens')

    const row = await pollUntilNotNull(() =>
      findAiUsageRecordForAgent(agentSlug, { inputTokens: 611, outputTokens: 81 }),
    )
    if (!row) throw new Error('ai_usage_records row was not written for the failed response')
    expect(row.model).toBe('gpt-5.4-nano-2026-03-17')
    expect(row.service_tier).toBe('flex')
    expect(row.pricing_status).toBe('priced')
  })
})
