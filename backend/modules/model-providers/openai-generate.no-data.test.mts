import { describe, expect, it, vi } from 'vitest'
import { generateJson } from './generate.mts'

const missingKeyRequest = {
  instructions: 'Return JSON.',
  input: 'input',
  schemaName: 'missing_key',
  schema: { type: 'object', properties: {}, required: [], additionalProperties: false },
  parse: (value: unknown) => value,
  maxOutputTokens: 1,
}

describe('default OpenAI JSON transport', () => {
  it.each(['direct', 'openrouter'] as const)(
    'converts a missing %s client key before SDK construction',
    async transport => {
      vi.stubEnv('OPENAI_API_KEY', '')
      vi.stubEnv('OPENROUTER_API_KEY', '')
      try {
        await expect(
          generateJson({ provider: 'openai', model: 'gpt-6-luna' }, missingKeyRequest, {
            openaiTransport: transport,
          }),
        ).rejects.toMatchObject({
          name: 'ModelProviderError',
          code: 'client-unavailable',
          retryClass: 'permanent',
          cause: { name: 'MissingModelClientCredentialError' },
        })
      } finally {
        vi.unstubAllEnvs()
      }
    },
  )
})
