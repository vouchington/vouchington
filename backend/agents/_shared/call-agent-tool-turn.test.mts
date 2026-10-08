import { describe, expect, it, vi } from 'vitest'
import {
  makeToolTurnResult,
  TEST_MODEL_SELECTION,
} from '@voucha/test-helpers/agents/model-call-result'
import { reserveSyntheticRunId } from '@voucha/test-helpers/data-stores/psql/classifier-runs/synthetic-run'
import { listAiUsageRecordsForClassifierRun } from '@voucha/test-helpers/entities/ai-usage'
import { withReservedAiUsageDay } from '@voucha/test-helpers/with-reserved-ai-usage-day'
import { SpendCapBreachError } from '@services/ai-usage'
import {
  callAgentToolTurn,
  callProviderToolTurn,
  type AgentToolTurnCaller,
} from './call-agent-tool-turn.mts'

const request = {
  instructions: 'Decide.',
  messages: [{ role: 'user' as const, text: 'Which topics?' }],
  tools: [],
  maxOutputTokens: 100,
}

describe('callAgentToolTurn (real PG)', () => {
  it('runs the turn on the selected provider and bills it to the classifier run', async () => {
    const classifierRunId = await reserveSyntheticRunId()
    const callTurn = vi.fn<AgentToolTurnCaller>(() => Promise.resolve(makeToolTurnResult([])))

    const result = await callAgentToolTurn({
      request,
      callTurn,
      agentSlug: 'autotagger-agent',
      selection: TEST_MODEL_SELECTION,
      classifierRunId,
    })

    expect(callTurn).toHaveBeenCalledWith(request, {
      selection: TEST_MODEL_SELECTION,
      openaiTransport: expect.any(String),
    })
    expect(await listAiUsageRecordsForClassifierRun(classifierRunId)).toMatchObject([
      { agent_slug: 'autotagger-agent', classifier_run_id: classifierRunId },
    ])
    expect(result.responseId).toMatch(/^resp-/)
  })

  it('reserves its attempt only after the spend cap admitted the turn', async () => {
    const callTurn = vi.fn<AgentToolTurnCaller>()
    const beforeDispatch = vi.fn<() => Promise<void>>().mockResolvedValue()

    await withReservedAiUsageDay(0, async () => {
      await expect(
        callAgentToolTurn({
          request,
          callTurn,
          beforeDispatch,
          agentSlug: 'autotagger-agent',
          selection: TEST_MODEL_SELECTION,
        }),
      ).rejects.toBeInstanceOf(SpendCapBreachError)
    })

    expect(beforeDispatch).not.toHaveBeenCalled()
    expect(callTurn).not.toHaveBeenCalled()
  })

  it('runs the dispatch hook before the turn', async () => {
    const order: string[] = []
    const callTurn = vi.fn<AgentToolTurnCaller>(() => {
      order.push('turn')
      return Promise.resolve(makeToolTurnResult([]))
    })

    await callAgentToolTurn({
      request,
      callTurn,
      beforeDispatch: () => Promise.resolve(void order.push('reserve')),
      agentSlug: 'autotagger-agent',
      selection: TEST_MODEL_SELECTION,
    })

    expect(order).toEqual(['reserve', 'turn'])
  })
})

describe('callProviderToolTurn', () => {
  it('refuses an unpriced model before any request is sent', async () => {
    await expect(
      callProviderToolTurn(request, {
        selection: { provider: 'anthropic', model: 'claude-unpriced' },
        openaiTransport: 'openrouter',
      }),
    ).rejects.toMatchObject({ code: 'unsupported-parameter' })
  })
})
