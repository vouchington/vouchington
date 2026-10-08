import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callCopyrightFormScreeningModel } from './model.mts'

// Real Anthropic call (credentialed project `backend-anthropic`); fails without a credential.
describe('copyright form screening on Anthropic Haiku 5.5', () => {
  it('returns an anti-spam recommendation with moderator guidance', async () => {
    const result = await callCopyrightFormScreeningModel(
      JSON.stringify({
        source_kind: 'signed_in_form',
        jurisdiction: 'us_dmca',
        statutory_fields_complete: true,
        claimant_display_name: 'Claimant',
        work_description: 'A photograph',
        hosted_use_urls: ['https://voucha.ai/posts/example'],
        has_claimant_contact: true,
        has_claimant_email: true,
        has_electronic_signature: true,
        has_good_faith_belief: true,
        has_accuracy_authority_under_penalty_of_perjury: true,
      }),
      'anthropic-test-screening',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(['not_obviously_invalid', 'invalid_or_spam']).toContain(result.output.recommendation)
    expect(result.output.guidance.summary.length).toBeGreaterThan(0)
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
