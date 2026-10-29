import { describe, expect, it } from 'vitest'
import type { StructuredDecisionBilledResponse } from '@modules/structured-decisions'
import { structuredDecisionUsageRecord } from '../structured-decision-billing-hooks.mts'

function billed(
  transport: StructuredDecisionBilledResponse['transport'],
  model: string,
): StructuredDecisionBilledResponse {
  return {
    id: undefined,
    model,
    usage: { input_tokens: 40, output_tokens: 3 },
    transport,
    requestStartedAt: new Date(0),
  }
}

describe('structuredDecisionUsageRecord', () => {
  it('prices OpenAI Decisions as direct Standard input with no billed output', () => {
    expect(structuredDecisionUsageRecord(billed('openai', 'gpt-6-luna'))).toEqual({
      response: {
        id: undefined,
        model: 'gpt-6-luna',
        usage: { input_tokens: 40, output_tokens: 0 },
        service_tier: 'default',
      },
      provider: 'openai',
      transport: 'direct',
    })
  })

  it('records Jev as TypeSafe on the transport that reached it', () => {
    expect(structuredDecisionUsageRecord(billed('openrouter', 'typesafe/jev-1.13'))).toEqual({
      response: {
        id: undefined,
        model: 'typesafe/jev-1.13',
        usage: { input_tokens: 40, output_tokens: 3 },
        service_tier: undefined,
      },
      provider: 'typesafe',
      transport: 'openrouter',
    })
  })
})
