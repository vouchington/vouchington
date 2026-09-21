import { describe, expect, it } from 'vitest'
import { createOpenRouterResponse, OPENROUTER_DEFAULT_AGENT_MODEL } from './create-response.mts'

describe('OpenRouter Responses', () => {
  const apiKey = process.env.OPENROUTER_API_KEY?.trim()

  it.skipIf(!apiKey)(
    'accepts the retained structured-output contract and returns billed metadata',
    async () => {
      const response = await createOpenRouterResponse({
        model: OPENROUTER_DEFAULT_AGENT_MODEL,
        input: 'Reply with exactly OK.',
        max_output_tokens: 64,
        safety_identifier: 'openrouter-credentialed-contract',
        service_tier: 'flex',
        prompt_cache_key: 'openrouter-credentialed-contract-v1',
        text: {
          format: {
            type: 'json_schema',
            name: 'openrouter_credentialed_contract',
            schema: {
              type: 'object',
              properties: { answer: { type: 'string' } },
              required: ['answer'],
              additionalProperties: false,
            },
          },
        },
      })

      expect(response.status).toBe('completed')
      expect(response.model).toContain('openai/gpt-5.4-nano')
      expect(JSON.parse(response.output_text)).toMatchObject({ answer: expect.any(String) })
      expect(response.usage).toMatchObject({
        input_tokens: expect.any(Number),
        output_tokens: expect.any(Number),
        cost: expect.any(Number),
      })
      expect(response.usage?.cost).toBeGreaterThanOrEqual(0)
    },
  )
})
