import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callCopyrightSubmissionGuidanceModel } from './model.mts'

// Real Anthropic call (credentialed project `backend-anthropic`); fails without a credential.
describe('copyright submission guidance on Anthropic Haiku 5.5', () => {
  it('returns closed advisory guidance for a counter-notice', async () => {
    const result = await callCopyrightSubmissionGuidanceModel(
      'counter_notice',
      JSON.stringify({
        statement: 'I created this image and I consent to jurisdiction and service of process.',
        has_name: true,
        has_address: true,
        has_telephone: true,
        has_signature: true,
      }),
      'anthropic-test-guidance',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(result.output.summary.length).toBeGreaterThan(0)
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
