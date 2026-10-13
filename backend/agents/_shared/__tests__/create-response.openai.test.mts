import { describe, expect, it } from 'vitest'
import { createOpenAIResponse } from '@modules/openai-utils/create-response'

describe('agents._shared.create-response', () => {
  /**
   * Non-gating smoke check of the OpenAI Responses API primitive against the live API.
   * The request we build, SSE parsing and the latch-and-stop policy are gated by recorded
   * responses in backend/modules/openai-utils/create-response.replay.no-data.mock.test.mts.
   * See docs/development/tests.md#live-provider-smoke-checks.
   */

  it(
    'createOpenAIResponse returns a non-empty text response',
    /* no-mistakes: integration=openai */
    async () => {
      if (!process.env.OPENAI_API_KEY?.trim()) {
        throw new Error('OPENAI_API_KEY is required for this credentialed test.')
      }
      const response = await createOpenAIResponse({
        model: 'gpt-6-luna',
        input: 'Reply with the single word OK and nothing else.',
      })
      expect(response).toBeDefined()
      expect(typeof response.output_text).toBe('string')
      expect((response.output_text as string).length).toBeGreaterThan(0)
    },
    30_000,
  )
})
