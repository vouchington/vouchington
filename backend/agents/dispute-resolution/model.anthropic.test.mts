import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callDisputeModel } from './model.mts'

// Real Anthropic call (credentialed project `backend-anthropic`); fails without a credential.
describe('dispute resolution on Anthropic Haiku 5.5', () => {
  it('returns a schema-valid draft with a priced ledger row shape', async () => {
    const result = await callDisputeModel(
      '## Review Content (post_id: 1)\nThe pizza was cold and the service slow.\n\n## Dispute Claim (reason: factually_inaccurate)\nThe review is false; I never served this customer.',
      'anthropic-test-author',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(['no_action', 'remove', 'annotate', 'dismiss']).toContain(
      result.output.recommended_action,
    )
    expect(result.output.public_response.length).toBeGreaterThan(0)
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
