import { describe, expect, it } from 'vitest'
import { createOpenAIResponse } from '../create-response.mts'
import { DEFAULT_AGENT_MODEL } from '../models.mts'
import { liveOpenAITest } from '@voucha/test-helpers'

describe('agents._shared.create-response', () => {
  /**
   * Credentialed happy-path test for the OpenAI Responses API primitive.
   * Other agent-level OpenAI tests live in their agent's __tests__ directory.
   */

  const hasOpenAIKey = Boolean(process.env.OPENAI_API_KEY)

  it.skipIf(!hasOpenAIKey)(
    'createOpenAIResponse returns a non-empty text response',
    /* no-mistakes: integration=openai */
    liveOpenAITest(async () => {
      const response = await createOpenAIResponse({
        model: DEFAULT_AGENT_MODEL,
        input: 'Reply with the single word OK and nothing else.',
      })
      expect(response).toBeDefined()
      expect(typeof response.output_text).toBe('string')
      expect((response.output_text as string).length).toBeGreaterThan(0)
    }),
    120_000,
  )
})
