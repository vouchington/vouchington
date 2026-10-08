import Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { callAnthropicToolTurn, type AnthropicToolDeps } from './anthropic-tool-turn.mts'
import { ModelProviderError } from './errors.mts'
import type { OpenAIDeps } from './openai-generate.mts'
import { generateToolTurn } from './tool-turn.mts'
import type { ToolTurnRequest } from './tool-turn-types.mts'

type CreateMessage = NonNullable<AnthropicToolDeps['createMessage']>
type CreateOpenRouter = NonNullable<OpenAIDeps['createOpenRouterResponse']>

const request: ToolTurnRequest = {
  instructions: 'Decide.',
  messages: [
    { role: 'user', text: 'Which topics?' },
    {
      role: 'assistant',
      text: 'Let me look.',
      toolCalls: [{ id: 'call_1', name: 'search_topics', input: { query: 'rust' } }],
    },
    { role: 'tool', results: [{ callId: 'call_1', content: '{"topics":[]}', isError: true }] },
  ],
  tools: [
    {
      name: 'search_topics',
      description: 'Search.',
      inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
    },
  ],
  maxOutputTokens: 300,
  safetyIdentifier: 'actor',
  promptCacheKey: 'cache-v1',
  flex: true,
  maxRetries: 1,
}

function message(overrides: Partial<Anthropic.Message> = {}): Anthropic.Message {
  return {
    id: 'msg_1',
    type: 'message',
    role: 'assistant',
    model: 'claude-haiku-5-5',
    content: [
      { type: 'text', text: 'Searching.', citations: null },
      { type: 'tool_use', id: 'toolu_1', name: 'search_topics', input: { query: 'go' } },
    ],
    stop_reason: 'tool_use',
    stop_sequence: null,
    usage: {
      input_tokens: 20,
      output_tokens: 8,
      cache_read_input_tokens: null,
      cache_creation_input_tokens: null,
      cache_creation: null,
      inference_geo: null,
      server_tool_use: null,
      service_tier: 'standard',
      output_tokens_details: null,
    },
    ...overrides,
  } as Anthropic.Message
}

describe('callAnthropicToolTurn', () => {
  it('sends the transcript and tools, requires a tool call and returns the parsed calls', async () => {
    const createMessage = vi.fn<CreateMessage>().mockResolvedValue(message())

    const result = await callAnthropicToolTurn('claude-haiku-5-5', request, { createMessage })

    const [params] = createMessage.mock.calls[0] as unknown as [Record<string, unknown>]
    expect(params).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 300,
      system: 'Decide.',
      tool_choice: { type: 'any' },
      metadata: { user_id: 'actor' },
      tools: [{ name: 'search_topics', description: 'Search.' }],
      messages: [
        { role: 'user', content: 'Which topics?' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'Let me look.' },
            { type: 'tool_use', id: 'call_1', name: 'search_topics', input: { query: 'rust' } },
          ],
        },
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'call_1',
              content: '{"topics":[]}',
              is_error: true,
            },
          ],
        },
      ],
    })
    expect(params).not.toHaveProperty('temperature')
    expect(result).toMatchObject({
      provider: 'anthropic',
      transport: 'direct',
      responseId: 'msg_1',
      usage: { inputTokens: 20, outputTokens: 8 },
      output: {
        text: 'Searching.',
        toolCalls: [{ id: 'toolu_1', name: 'search_topics', input: { query: 'go' } }],
      },
    })
  })

  it('omits empty assistant text and a successful tool result flag', async () => {
    const createMessage = vi.fn<CreateMessage>().mockResolvedValue(message())

    await callAnthropicToolTurn(
      'claude-haiku-5-5',
      {
        ...request,
        messages: [
          { role: 'assistant', text: '', toolCalls: [{ id: 'a', name: 't', input: {} }] },
          { role: 'tool', results: [{ callId: 'a', content: 'ok' }] },
        ],
      },
      { createMessage },
    )

    const [params] = createMessage.mock.calls[0] as unknown as [{ messages: unknown[] }]
    expect(params.messages).toEqual([
      { role: 'assistant', content: [{ type: 'tool_use', id: 'a', name: 't', input: {} }] },
      { role: 'user', content: [{ type: 'tool_result', tool_use_id: 'a', content: 'ok' }] },
    ])
  })

  it.each([
    ['a refusal', message({ stop_reason: 'refusal' }), 'refusal'],
    ['a cut-off turn', message({ stop_reason: 'max_tokens' }), 'output-truncated'],
    [
      'a turn with no tool call',
      message({ content: [], stop_reason: 'end_turn' }),
      'invalid-response',
    ],
  ])('throws a billed, permanent error for %s', async (_name, answer, code) => {
    const createMessage = vi.fn<CreateMessage>().mockResolvedValue(answer)

    const error = await callAnthropicToolTurn('claude-haiku-5-5', request, { createMessage }).catch(
      (err: unknown) => err,
    )

    expect(error).toBeInstanceOf(ModelProviderError)
    expect(error).toMatchObject({
      code,
      retryClass: 'permanent',
      billedResponse: { responseId: 'msg_1' },
    })
  })

  it('classifies a provider failure without a billed response', async () => {
    const createMessage = vi
      .fn<CreateMessage>()
      .mockRejectedValue(new Anthropic.APIConnectionError({ message: 'down' }))

    await expect(
      callAnthropicToolTurn('claude-haiku-5-5', request, { createMessage }),
    ).rejects.toMatchObject({ code: 'connection', retryClass: 'transient', ambiguousBilled: true })
  })
})

describe('generateToolTurn', () => {
  it('routes Anthropic to Messages and OpenAI to Responses', async () => {
    const createMessage = vi.fn<CreateMessage>().mockResolvedValue(message())
    const createOpenRouterResponse = vi.fn<CreateOpenRouter>().mockResolvedValue({
      id: 'resp_1',
      status: 'completed',
      output: [{ type: 'function_call', call_id: 'c1', name: 'search_topics', arguments: '{}' }],
      output_text: '',
      model: 'gpt-6-luna',
      usage: { input_tokens: 1, output_tokens: 1 },
    } as never)
    const deps = { createMessage, createOpenRouterResponse }

    const anthropic = await generateToolTurn(
      { provider: 'anthropic', model: 'claude-haiku-5-5' },
      request,
      { openaiTransport: 'openrouter', deps },
    )
    const openai = await generateToolTurn({ provider: 'openai', model: 'gpt-6-luna' }, request, {
      openaiTransport: 'openrouter',
      deps,
    })

    expect(anthropic.provider).toBe('anthropic')
    expect(openai.provider).toBe('openai')
    expect(createMessage).toHaveBeenCalledTimes(1)
    expect(createOpenRouterResponse).toHaveBeenCalledTimes(1)
  })

  it('passes the caller’s abort signal to both providers', async () => {
    const signal = new AbortController().signal
    const createMessage = vi.fn<CreateMessage>().mockResolvedValue(message())
    const createOpenRouterResponse = vi.fn<CreateOpenRouter>().mockResolvedValue({
      id: 'resp_1',
      status: 'completed',
      output: [{ type: 'function_call', call_id: 'c1', name: 'search_topics', arguments: '{}' }],
      output_text: '',
      model: 'gpt-6-luna',
      usage: { input_tokens: 1, output_tokens: 1 },
    } as never)
    const deps = { createMessage, createOpenRouterResponse }

    await generateToolTurn({ provider: 'anthropic', model: 'claude-haiku-5-5' }, request, {
      openaiTransport: 'openrouter',
      signal,
      deps,
    })
    await generateToolTurn({ provider: 'openai', model: 'gpt-6-luna' }, request, {
      openaiTransport: 'openrouter',
      signal,
      deps,
    })

    expect(createMessage.mock.calls[0]![1]).toEqual({ signal })
    expect(createOpenRouterResponse.mock.calls[0]![1]).toMatchObject({ signal })
  })

  it('rejects an unpriced model before any request', async () => {
    const createMessage = vi.fn<CreateMessage>()

    await expect(
      generateToolTurn({ provider: 'anthropic', model: 'claude-unpriced' }, request, {
        openaiTransport: 'openrouter',
        deps: { createMessage },
      }),
    ).rejects.toMatchObject({ code: 'unsupported-parameter' })
    expect(createMessage).not.toHaveBeenCalled()
  })
})
