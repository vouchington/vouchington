import { describe, expect, it, vi } from 'vitest'
import {
  bakeryStructuredDecisionRequest as request,
  makeOpenAIStructuredDecisionBody as makeOpenAIBody,
  makeStructuredDecisionResponse as makeResponse,
} from '@voucha/test-helpers/structured-decisions-fixtures'
import {
  createStructuredDecisionClient,
  type StructuredDecisionAttemptHooks,
  type StructuredDecisionFetch,
} from './structured-decisions.mts'
import { structuredDecisionApiKey } from './transport.mts'

function openAIClient(fetch: StructuredDecisionFetch, hooks?: StructuredDecisionAttemptHooks) {
  return createStructuredDecisionClient({ transport: 'openai', apiKey: 'test-key', fetch, hooks })
}

describe('OpenAI Decisions transport', () => {
  it('asks gpt-6-luna at /v1/decisions without a service tier', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(makeResponse(makeOpenAIBody()))

    await openAIClient(fetch).decide(request)

    const [url, init] = fetch.mock.calls[0]!
    expect(url).toBe('https://api.openai.com/v1/decisions')
    expect(init?.headers).toMatchObject({ authorization: 'Bearer test-key' })
    const body = JSON.parse(init?.body as string) as Record<string, unknown>
    expect(body).toMatchObject({ model: 'gpt-6-luna', input: request.state })
    expect(body).not.toHaveProperty('service_tier')
  })

  it('normalizes predicate, choice, and score answers into the provider-neutral result', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(makeResponse(makeOpenAIBody()))

    const result = await openAIClient(fetch).decide(request)

    expect(result).toMatchObject({ model: 'gpt-6-luna', provider: 'OpenAI' })
    expect(result.answers).toMatchObject([
      { id: 'spam', type: 'noul', probability: 0.2 },
      { id: 'topic', type: 'choice', choice: 'food', probabilities: { food: 0.8, sports: 0.2 } },
      { id: 'quality', type: 'score', score: 1, legend: ['poor', 'excellent'] },
    ])
  })

  it('rejects a response served by another model', async () => {
    const fetch = vi
      .fn<StructuredDecisionFetch>()
      .mockResolvedValue(makeResponse(makeOpenAIBody({ model: 'typesafe/jev-1.13' })))

    await expect(openAIClient(fetch).decide(request)).rejects.toMatchObject({
      code: 'invalid-response',
    })
  })

  it('reports billed usage with the openai transport', async () => {
    const fetch = vi.fn<StructuredDecisionFetch>().mockResolvedValue(makeResponse(makeOpenAIBody()))
    const onBilledResponse =
      vi.fn<NonNullable<StructuredDecisionAttemptHooks['onBilledResponse']>>()

    await openAIClient(fetch, { onBilledResponse }).decide(request)

    expect(onBilledResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'gpt-6-luna',
        transport: 'openai',
        usage: expect.objectContaining({ input_tokens: 40, output_tokens: 3 }),
      }),
    )
  })
})

describe('structuredDecisionApiKey', () => {
  it.each(['openai', 'openrouter'] as const)('prefers an explicit %s key', transport => {
    expect(structuredDecisionApiKey(transport, 'explicit')).toBe('explicit')
  })

  it('has no key source for direct TypeSafe', () => {
    expect(() => structuredDecisionApiKey('typesafe', 'explicit')).toThrow(
      "no API key source for provider 'typesafe'",
    )
  })
})
