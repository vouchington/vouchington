import { describe, expect, it } from 'vitest'
import { generateJson } from './generate.mts'
import { calcCostMicrounits } from './pricing.mts'

type Verdict = { capital: string }

// Non-gating smoke check of the live Anthropic Messages API (credentialed project
// `backend-anthropic`): the key or the federated token must be set, like every other credentialed
// test. The request we build, response parsing, usage normalization and failure classification are
// gated by recorded responses in generate.replay.no-data.mock.test.mts.
// See docs/development/tests.md#live-provider-smoke-checks.
describe('generateJson on Anthropic Haiku 5.5', () => {
  it('returns schema-valid JSON with priced provider-neutral usage', async () => {
    const result = await generateJson(
      { provider: 'anthropic', model: 'claude-haiku-5-5' },
      {
        instructions: 'Answer with the capital city only.',
        input: 'What is the capital of France?',
        schemaName: 'capital',
        schema: {
          type: 'object',
          properties: { capital: { type: 'string' } },
          required: ['capital'],
          additionalProperties: false,
        },
        parse: value => value as Verdict,
        maxOutputTokens: 200,
      },
      { openaiTransport: 'openrouter' },
    )

    expect(result.output.capital).toMatch(/paris/i)
    expect(result.provider).toBe('anthropic')
    expect(result.responseId).toBeTruthy()
    expect(result.usage.inputTokens).toBeGreaterThan(0)
    expect(result.usage.outputTokens).toBeGreaterThan(0)
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
  })
})
