import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callAppealModel } from './model.mts'

// Non-gating smoke check of the live Anthropic Messages API (credentialed project
// `backend-anthropic`); fails without a credential. The request this agent builds and its schema
// and parsing are gated by recorded responses in model.replay.no-data.mock.test.mts.
// See docs/development/tests.md#live-provider-smoke-checks.
describe('appeal resolution on Anthropic Haiku 5.5', () => {
  it('returns a schema-valid draft with a priced ledger row shape', async () => {
    const result = await callAppealModel(
      '## Original Action\nOriginal action: Warning\nReason: Off-topic post\n\n## Appeal Reason\nThe post was on topic; I linked the thread it answered.',
      'anthropic-test-appellant',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(['accept', 'deny', 'reduce']).toContain(result.output.recommended_action)
    expect(result.output.public_response.length).toBeGreaterThan(0)
    expect(result.output.internal_response.length).toBeGreaterThan(0)
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
