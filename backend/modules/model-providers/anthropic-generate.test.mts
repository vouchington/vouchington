import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { callAnthropicJson, type AnthropicDeps } from './anthropic-generate.mts'
import { ModelProviderError } from './errors.mts'
import type { GenerateJsonRequest } from './types.mts'

type Answer = { verdict: 'yes' | 'no' }
type CreateMessage = NonNullable<AnthropicDeps['createMessage']>

const request: GenerateJsonRequest<Answer> = {
  instructions: 'Decide.',
  input: 'Is it?',
  schemaName: 'answer',
  schema: {
    type: 'object',
    properties: { verdict: { type: 'string', enum: ['yes', 'no'] } },
    required: ['verdict'],
    additionalProperties: false,
  },
  parse: value => value as Answer,
  maxOutputTokens: 256,
  safetyIdentifier: 'user-hash',
}

function message(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [{ type: 'text', text: '{"verdict":"yes"}', citations: null }],
    stop_reason: 'end_turn',
    stop_sequence: null,
    usage: {
      input_tokens: 20,
      output_tokens: 8,
      cache_read_input_tokens: 100,
      cache_creation_input_tokens: 50,
      cache_creation: { ephemeral_5m_input_tokens: 50, ephemeral_1h_input_tokens: 0 },
      inference_geo: null,
      server_tool_use: null,
      service_tier: 'standard',
      output_tokens_details: null,
    },
    ...overrides,
  } as Anthropic.Message
}

describe('callAnthropicJson', () => {
  it('sends a schema-constrained request with no sampling parameters', async () => {
    const createMessage = vi.fn<CreateMessage>().mockResolvedValue(message())

    const result = await callAnthropicJson('claude-haiku-5-5', request, { createMessage })

    const [params] = createMessage.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(params).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 256,
      system: 'Decide.',
      messages: [{ role: 'user', content: 'Is it?' }],
      output_config: { format: { type: 'json_schema', schema: request.schema } },
      metadata: { user_id: 'user-hash' },
    })
    expect(params).not.toHaveProperty('temperature')
    expect(params).not.toHaveProperty('top_p')
    expect(params).not.toHaveProperty('top_k')
    expect(result).toMatchObject({
      output: { verdict: 'yes' },
      provider: 'anthropic',
      transport: 'direct',
      model: 'claude-haiku-5-5',
      responseId: 'msg_1',
      serviceTier: 'standard',
      usage: { inputTokens: 170, cacheReadTokens: 100, cacheWrite5mTokens: 50, outputTokens: 8 },
    })
  })

  it.each([
    [
      'a schema-invalid answer',
      message({ content: [{ type: 'text', text: '{"verdict":"maybe"}' }] as never }),
      'invalid-response',
    ],
    [
      'non-JSON text',
      message({ content: [{ type: 'text', text: 'yes' }] as never }),
      'invalid-response',
    ],
    ['no text block', message({ content: [] }), 'invalid-response'],
    ['a refusal', message({ stop_reason: 'refusal' }), 'refusal'],
    ['a truncated answer', message({ stop_reason: 'max_tokens' }), 'output-truncated'],
  ] as const)('keeps the billed usage when the answer is %s', async (_name, response, code) => {
    const createMessage = vi.fn<CreateMessage>().mockResolvedValue(response)

    const failure = await callAnthropicJson('claude-haiku-5-5', request, { createMessage }).catch(
      (err: unknown) => err,
    )

    expect(failure).toBeInstanceOf(ModelProviderError)
    expect(failure).toMatchObject({
      code,
      retryClass: 'permanent',
      billedResponse: { responseId: 'msg_1', usage: { inputTokens: 170, outputTokens: 8 } },
    })
  })

  it('classifies a provider failure and passes other errors through unchanged', async () => {
    const overloaded = Anthropic.APIError.generate(
      529,
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
      'Overloaded',
      new Headers(),
    )
    const classified = await callAnthropicJson('claude-haiku-5-5', request, {
      createMessage: vi.fn<CreateMessage>().mockRejectedValue(overloaded),
    }).catch((err: unknown) => err)
    expect(classified).toMatchObject({ code: 'overloaded', retryClass: 'transient' })

    const unknown = new TypeError('not an API error')
    await expect(
      callAnthropicJson('claude-haiku-5-5', request, {
        createMessage: vi.fn<CreateMessage>().mockRejectedValue(unknown),
      }),
    ).rejects.toBe(unknown)
  })
})
