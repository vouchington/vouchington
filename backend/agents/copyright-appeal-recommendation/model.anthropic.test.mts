import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callCopyrightAppealRecommendationModel } from './model.mts'

// Real Anthropic call (credentialed project `backend-anthropic`); fails without a credential.
describe('copyright appeal recommendation on Anthropic Haiku 5.5', () => {
  it('returns a bounded advisory recommendation', async () => {
    const result = await callCopyrightAppealRecommendationModel(
      JSON.stringify({
        reason: 'I created this image.',
        targets: ['https://voucha.ai/posts/example'],
      }),
      'anthropic-test-appeal',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(['confirm', 'modify', 'reverse', 'uncertain']).toContain(result.output.recommendation)
    expect(result.output.rationale.length).toBeGreaterThan(0)
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
