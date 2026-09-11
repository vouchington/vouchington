import { describe, expect, it, vi } from 'vitest'
import type { AgentTool } from '@services/openai-agents'
import { runToolLoop, type RunToolLoopConfig } from '../run-tool-loop.mts'
import {
  makeTextResponse,
  makeToolCall,
  makeToolCallResponse,
} from '../test-helpers/run-tool-loop-test-helpers.mts'
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

describe('runToolLoop usage settlement barrier', () => {
  it('does not issue the next provider call before the prior response is settled', async () => {
    const recorderSettled = Promise.withResolvers<void>()
    const recordUsage = vi
      .fn<typeof recordAgentResponseUsage>()
      .mockImplementationOnce(async () => await recorderSettled.promise)
      .mockResolvedValue(undefined)
    const createOpenAIResponse = vi
      .fn<VitestLooseMock>()
      .mockResolvedValueOnce(makeToolCallResponse('resp-first'))
      .mockResolvedValueOnce(makeTextResponse('settled', 'resp-second'))
    const getFunctionCallsFromOutput = vi
      .fn<VitestLooseMock>()
      .mockReturnValueOnce([makeToolCall()])
      .mockReturnValueOnce([])
    const executeToolCalls = vi.fn<VitestLooseMock>().mockResolvedValue({ toolResults: [] })
    const loop = runToolLoop({
      ...config,
      deps: {
        createOpenAIResponse,
        getFunctionCallsFromOutput,
        executeToolCalls,
        recordAgentResponseUsage: recordUsage,
      },
    })

    await vi.waitFor(() => expect(recordUsage).toHaveBeenCalledOnce())
    expect(createOpenAIResponse).toHaveBeenCalledOnce()
    recorderSettled.resolve()

    await expect(loop).resolves.toMatchObject({ text: 'settled', iterations: 2 })
    expect(createOpenAIResponse).toHaveBeenCalledTimes(2)
  })
})
