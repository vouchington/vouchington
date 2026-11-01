import { describe, expect, it } from 'vitest'
import { ANTHROPIC_HAIKU_CALL } from '@voucha/test-helpers/agents/model-call-result'
import { generateChatTitleFromInput } from './generate-title.mts'

// Non-gating smoke check of the live Anthropic Messages API (credentialed project
// `backend-anthropic`); fails without a credential. The request this agent builds and its schema
// and parsing are gated by recorded responses in generate-title.replay.mock.test.mts.
// See docs/development/tests.md#live-provider-smoke-checks.
describe('conversation title on Anthropic Haiku 5.5', () => {
  // no-mistakes-timeout-reason: live Anthropic network request latency
  it('returns a short title', async () => {
    const title = await generateChatTitleFromInput(
      'user: Can you help me plan a three day trip to Lisbon?',
      'anthropic-test-user',
      ANTHROPIC_HAIKU_CALL.selection,
    )

    expect(title.trim().length).toBeGreaterThan(0)
    expect(title).not.toEqual('New Conversation')
  }, 30_000)
})
