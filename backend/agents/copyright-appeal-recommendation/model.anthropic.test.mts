import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callCopyrightAppealRecommendationModel } from './model.mts'

// Non-gating smoke check of the live Anthropic Messages API (credentialed project
// `backend-anthropic`); fails without a credential. The request this agent builds and its schema
// and parsing are gated by recorded responses in model.replay.no-data.mock.test.mts.
// See docs/development/tests.md#live-provider-smoke-checks.
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
