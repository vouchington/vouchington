import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { calcCostMicrounits } from '@modules/model-providers/pricing'
import { callConversationTitleModel } from './generate-title.mts'

// Non-gating smoke check of the live Anthropic Messages API (credentialed project
// `backend-anthropic`); fails without a credential. The request this agent builds and its schema
// and parsing are gated by recorded responses in generate-title.replay.no-data.mock.test.mts.
// See docs/development/tests.md#live-provider-smoke-checks.
describe('conversation title on Anthropic Haiku 5.5', () => {
  it('returns a short title', async () => {
    const result = await callConversationTitleModel(
      'user: Can you help me plan a three day trip to Lisbon?',
      'anthropic-test-user',
      ANTHROPIC_HAIKU_CALL,
    )

    expect(result.output.title.trim().length).toBeGreaterThan(0)
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
