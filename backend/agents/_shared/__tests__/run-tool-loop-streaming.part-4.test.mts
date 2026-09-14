import { describe, expect, it, vi } from 'vitest'
import type { AgentTool } from '@services/openai-agents'
import type { RunToolLoopConfig } from '../run-tool-loop.mts'
import { runToolLoopStreaming } from '../run-tool-loop-streaming.mts'
import {
  drainRunToolLoopStream,
  makeNoTextStream,
  makeTextResponse,
  makeToolCall,
  makeToolCallResponse,
  makeToolResult,
} from '../../../test-helpers/agents/_shared/run-tool-loop-test-helpers.mts'
import { recordAgentResponseUsage } from '../record-response-usage.mts'

const tool: AgentTool = {
  schema: { name: 'search_posts', description: 'Search posts', parameters: {} },
  executor: vi.fn<VitestLooseMock>(),
}

const config: RunToolLoopConfig = {
  model: 'gpt-5.4-nano',
  instructions: 'Use tools when needed.',
  tools: [tool],
  input: 'Find a post.',
  maxIterations: 2,
  safetyIdentifier: 'settlement-test-user',
  agentSlug: 'settlement-test',
}

async function* toolResultStream() {
  yield* []
  return makeToolResult()
}

describe('runToolLoopStreaming usage settlement barrier', () => {
  it('does not begin the next stream before the prior response is settled', async () => {
    const recorderSettled = Promise.withResolvers<void>()
    const recordUsage = vi
      .fn<typeof recordAgentResponseUsage>()
      .mockImplementationOnce(async () => await recorderSettled.promise)
      .mockResolvedValue(undefined)
    const streamOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockImplementationOnce(makeNoTextStream(makeToolCallResponse('resp-first')))
      .mockImplementationOnce(makeNoTextStream(makeTextResponse('settled', 'resp-second')))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const dispatchOneToolCall = vi.fn<VitestLooseMock>().mockImplementation(toolResultStream)
    const drain = drainRunToolLoopStream(
      runToolLoopStreaming({
        ...config,
        deps: {
          streamOpenAIResponse,
          getFunctionCallsFromOutput,
          dispatchOneToolCall,
          recordAgentResponseUsage: recordUsage,
        },
      }),
    )

    await vi.waitFor(() => expect(recordUsage).toHaveBeenCalledOnce())
    expect(streamOpenAIResponse).toHaveBeenCalledOnce()
    recorderSettled.resolve()

    await expect(drain).resolves.toMatchObject({ returnValue: { iterations: 2, text: 'settled' } })
    expect(streamOpenAIResponse).toHaveBeenCalledTimes(2)
  })
})
