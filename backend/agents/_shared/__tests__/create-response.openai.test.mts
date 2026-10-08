import { describe, expect, it } from 'vitest'
import { createOpenAIResponse } from '@modules/openai-utils/create-response'

describe('agents._shared.create-response', () => {
  /**
   * Credentialed happy-path test for the OpenAI Responses API primitive.
   * Other agent-level OpenAI tests live in their agent's __tests__ directory.
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
