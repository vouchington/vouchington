import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { generateJson } from './generate.mts'
import { calcCostMicrounits } from './pricing.mts'

// Recorded Messages API responses are served through the real Anthropic SDK's `fetch` option, so
// the SDK builds the request and parses real status lines, headers and JSON bodies. The fixtures
// are hand-written from Anthropic's documented wire format. The live counterpart is the non-gating
// smoke check in generate.anthropic.test.mts.
const replay = await vi.hoisted(async () => {
  const { createProviderReplay } = await import('../../test-helpers/provider-replay.mts')
  return createProviderReplay()
})

vi.mock<typeof import('@anthropic-ai/sdk')>(import('@anthropic-ai/sdk'), async importOriginal => {
  const actual = await importOriginal()
  const { replayClient } = await import('../../test-helpers/provider-replay.mts')
  return { ...actual, default: replayClient(actual.default, replay) }
})

type Capital = { capital: string }

const SCHEMA = {
  type: 'object',
  properties: { capital: { type: 'string' } },
  required: ['capital'],
  additionalProperties: false,
}

const SELECTION = { provider: 'anthropic', model: 'claude-haiku-5-5' } as const
const OPTIONS = { openaiTransport: 'openrouter' } as const

function ask() {
  return generateJson(
    SELECTION,
    {
      instructions: 'Answer with the capital city only.',
      input: 'What is the capital of France?',
      schemaName: 'capital',
      schema: SCHEMA,
      parse: value => value as Capital,
      maxOutputTokens: 200,
      safetyIdentifier: 'user-hash',
    },
    OPTIONS,
  )
}

describe('generateJson against recorded Anthropic Messages responses', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
    replay.reset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('sends one schema-constrained request and returns the parsed, priced, billed answer', async () => {
    replay.respondWith(loadRecordedResponse('anthropic/messages-json-end-turn.http'))

    const result = await ask()

    expect(replay.requests).toHaveLength(1)
    expect(replay.requests[0]).toMatchObject({
      method: 'POST',
      headers: { 'x-api-key': 'test-key' },
    })
    const body = replay.requests[0]?.json<Record<string, unknown>>()
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 200,
      system: 'Answer with the capital city only.',
      messages: [{ role: 'user', content: 'What is the capital of France?' }],
      output_config: { format: { type: 'json_schema', schema: SCHEMA } },
      metadata: { user_id: 'user-hash' },
    })
    for (const key of ['temperature', 'top_p', 'top_k', 'stream']) {
      expect(body).not.toHaveProperty(key)
    }

    // The fields the usage ledger reads: id, the served snapshot and tier, and normalized tokens.
    // Anthropic's `input_tokens` is only the uncached remainder (21); the cache reads (340) and the
    // 5-minute (100) and 1-hour (50) cache writes make up the rest of the prompt.
    expect(result).toMatchObject({
      output: { capital: 'Paris' },
      provider: 'anthropic',
      transport: 'direct',
      model: 'claude-haiku-5-5-20261001',
      responseId: 'msg_01ReplayFixtureCapital',
      serviceTier: 'standard',
      usage: {
        inputTokens: 21 + 340 + 100 + 50,
        cacheReadTokens: 340,
        cacheWrite5mTokens: 100,
        cacheWrite1hTokens: 50,
        outputTokens: 17,
      },
    })
    expect(
      calcCostMicrounits('anthropic', result.model, result.serviceTier, result.usage),
    ).not.toBeNull()
    replay.assertDrained()
  })

  it('authenticates with the federated token as a bearer when no API key is set', async () => {
    vi.stubEnv('ANTHROPIC_API_KEY', '')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', 'federated-token')
    replay.respondWith(loadRecordedResponse('anthropic/messages-json-end-turn.http'))

    await ask()

    expect(replay.requests[0]?.headers).toMatchObject({ authorization: 'Bearer federated-token' })
    expect(replay.requests[0]?.headers).not.toHaveProperty('x-api-key')
    replay.assertDrained()
  })

  // The SDK builds each error from the status line, headers and body; classification is ours.
  it.each([
    {
      fixture: 'messages-error-overloaded-529.http',
      expected: {
        code: 'overloaded',
        retryClass: 'transient',
        status: 529,
        retryAfterMs: 3_000,
        ambiguousBilled: true,
      },
    },
    {
      fixture: 'messages-error-credit-balance-400.http',
      expected: {
        code: 'credit-balance-too-low',
        retryClass: 'permanent',
        status: 400,
        ambiguousBilled: false,
      },
    },
    {
      fixture: 'messages-error-authentication-401.http',
      expected: {
        code: 'authentication',
        retryClass: 'permanent',
        status: 401,
        ambiguousBilled: false,
      },
    },
  ])('classifies $fixture and sends exactly one request', async ({ fixture, expected }) => {
    replay.respondWith(loadRecordedResponse(`anthropic/${fixture}`))

    const failure: unknown = await ask().catch((err: unknown) => err)

    expect(failure).toMatchObject({ name: 'ModelProviderError', ...expected })
    // The SDK's own retries are off: retrying is the caller's lifecycle decision, because a retry
    // after a possibly billed attempt is a double bill. A retry would have had no response queued.
    expect(replay.requests).toHaveLength(1)
    replay.assertDrained()
  })
})
