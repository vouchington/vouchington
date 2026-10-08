import { describe, expect, it, vi } from 'vitest'
import { ModelProviderError } from './errors.mts'
import { assertSupportedRequest, generateJson } from './generate.mts'
import type { AnthropicDeps } from './anthropic-generate.mts'
import type { OpenAIDeps } from './openai-generate.mts'
import type { GenerateJsonRequest } from './types.mts'

type Answer = { verdict: string }
type CreateOpenAI = NonNullable<OpenAIDeps['createOpenAIResponse']>
type CreateOpenRouter = NonNullable<OpenAIDeps['createOpenRouterResponse']>
type CreateMessage = NonNullable<AnthropicDeps['createMessage']>

const request: GenerateJsonRequest<Answer> = {
  instructions: 'Decide.',
  input: 'Is it?',
  schemaName: 'answer',
  schema: {
    type: 'object',
    properties: { verdict: { type: 'string' } },
    required: ['verdict'],
    additionalProperties: false,
  },
  parse: value => value as Answer,
  maxOutputTokens: 100,
  safetyIdentifier: 'user-hash',
  promptCacheKey: 'cache-v1',
  flex: true,
  maxRetries: 2,
}

function openAIResponse() {
  return {
    id: 'resp_1',
    status: 'completed' as const,
    output: [],
    output_text: '{"verdict":"yes"}',
    model: 'gpt-6-luna-2026-10-01',
    service_tier: 'flex' as const,
    usage: {
      input_tokens: 100,
      output_tokens: 10,
      input_tokens_details: { cached_tokens: 40 },
      output_tokens_details: { reasoning_tokens: 4 },
    },
  }
}

describe('assertSupportedRequest', () => {
  it.each([{ temperature: 0.2 }, { topP: 0.9 }, { topK: 5 }])(
    'rejects %o for Haiku 5.5 before any request',
    parameters => {
      expect(() =>
        assertSupportedRequest({ provider: 'anthropic', model: 'claude-haiku-5-5' }, parameters),
      ).toThrow(expect.objectContaining({ code: 'unsupported-parameter' }))
    },
  )

  it('accepts a request without sampling parameters and rejects an unpriced model', () => {
    expect(() =>
      assertSupportedRequest({ provider: 'anthropic', model: 'claude-haiku-5-5' }, {}),
    ).not.toThrow()
    expect(() => assertSupportedRequest({ provider: 'openai', model: 'gpt-9' }, {})).toThrow(
      ModelProviderError,
    )
    expect(() =>
      assertSupportedRequest({ provider: 'anthropic', model: 'gpt-6-luna' }, {}),
    ).toThrow(/no price row/)
  })
})

describe('generateJson', () => {
  it('routes OpenAI through OpenRouter with the OpenRouter model name', async () => {
    const createOpenRouterResponse = vi
      .fn<CreateOpenRouter>()
      .mockResolvedValue(openAIResponse() as never)
    const createOpenAIResponse = vi.fn<CreateOpenAI>()

    const result = await generateJson({ provider: 'openai', model: 'gpt-6-luna' }, request, {
      openaiTransport: 'openrouter',
      deps: { createOpenRouterResponse, createOpenAIResponse },
    })

    expect(createOpenAIResponse).not.toHaveBeenCalled()
    expect(createOpenRouterResponse).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'openai/gpt-6-luna',
        max_output_tokens: 100,
        safety_identifier: 'user-hash',
        prompt_cache_key: 'cache-v1',
        service_tier: 'flex',
        text: { format: expect.objectContaining({ type: 'json_schema', name: 'answer' }) },
      }),
      { maxRetries: 2 },
    )
    expect(result).toMatchObject({
      output: { verdict: 'yes' },
      provider: 'openai',
      transport: 'openrouter',
      model: 'gpt-6-luna-2026-10-01',
      responseId: 'resp_1',
      serviceTier: 'flex',
      usage: { inputTokens: 100, cacheReadTokens: 40, reasoningOutputTokens: 4 },
    })
  })

  it('routes OpenAI directly with the bare model name when the transport is direct', async () => {
    const createOpenAIResponse = vi.fn<CreateOpenAI>().mockResolvedValue(openAIResponse() as never)
    const createOpenRouterResponse = vi.fn<CreateOpenRouter>()

    const result = await generateJson({ provider: 'openai', model: 'gpt-6-luna' }, request, {
      openaiTransport: 'direct',
      deps: { createOpenRouterResponse, createOpenAIResponse },
    })

    expect(createOpenRouterResponse).not.toHaveBeenCalled()
    expect(createOpenAIResponse).toHaveBeenCalledWith(
      expect.objectContaining({ model: 'gpt-6-luna' }),
      { maxRetries: 2 },
    )
    expect(result.transport).toBe('direct')
  })

  it('keeps the billed usage when an OpenAI answer fails schema validation', async () => {
    const createOpenAIResponse = vi
      .fn<CreateOpenAI>()
      .mockResolvedValue({ ...openAIResponse(), output_text: '{"other":1}' } as never)

    const failure = await generateJson({ provider: 'openai', model: 'gpt-6-luna' }, request, {
      openaiTransport: 'direct',
      deps: { createOpenAIResponse },
    }).catch((err: unknown) => err)

    expect(failure).toMatchObject({
      code: 'invalid-response',
      billedResponse: { responseId: 'resp_1', usage: { inputTokens: 100 } },
    })
  })

  it('sends Anthropic calls to the Messages API and ignores the OpenAI transport', async () => {
    const createMessage = vi.fn<CreateMessage>().mockResolvedValue({
      id: 'msg_9',
      model: 'claude-haiku-5-5',
      content: [{ type: 'text', text: '{"verdict":"no"}' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 5, output_tokens: 2, service_tier: 'standard' },
    } as never)

    const result = await generateJson(
      { provider: 'anthropic', model: 'claude-haiku-5-5' },
      request,
      { openaiTransport: 'direct', deps: { createMessage } },
    )

    expect(result).toMatchObject({
      provider: 'anthropic',
      transport: 'direct',
      output: { verdict: 'no' },
    })
  })
})
