import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callJudgementModel } from './model.mts'

// Real Anthropic call (credentialed project `backend-anthropic`); fails without a credential.
describe('report judgement on Anthropic Haiku 5.5', () => {
  it('returns a schema-valid judgement and a priced ledger row shape', async () => {
    const result = await callJudgementModel(
      '## Reported Content (type: post)\nBuy cheap watches at example.com now!!!\n\n## Reports (1 total)\n- Reason: spam',
      'anthropic-test-author',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(['no_action', 'warn', 'remove', 'escalate']).toContain(result.output.recommended_action)
    expect(result.output.public_response.length).toBeGreaterThan(0)
    expect(result.output.internal_response.length).toBeGreaterThan(0)
    expect(result.provider).toBe('anthropic')
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
