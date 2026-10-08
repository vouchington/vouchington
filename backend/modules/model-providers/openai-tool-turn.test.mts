import { describe, expect, it, vi } from 'vitest'
import type { OpenAIDeps } from './openai-generate.mts'
import { callOpenAIToolTurn } from './openai-tool-turn.mts'
import type { ToolTurnRequest } from './tool-turn-types.mts'

type CreateOpenAI = NonNullable<OpenAIDeps['createOpenAIResponse']>
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

function openAIResponse(output: unknown[]) {
  return {
    id: 'resp_1',
    status: 'completed' as const,
    output,
    output_text: 'Looking.',
    model: 'gpt-6-luna-2026-10-01',
    service_tier: 'flex' as const,
    usage: { input_tokens: 100, output_tokens: 10 },
  }
}

const functionCall = {
  type: 'function_call',
  call_id: 'call_9',
  name: 'search_topics',
  arguments: '{"query":"go"}',
}

describe('callOpenAIToolTurn', () => {
  it('sends function tools as Responses items through OpenRouter and parses the calls', async () => {
    const createOpenRouterResponse = vi
      .fn<CreateOpenRouter>()
      .mockResolvedValue(openAIResponse([functionCall]) as never)

    const result = await callOpenAIToolTurn('gpt-6-luna', 'openrouter', request, {
      createOpenRouterResponse,
    })

    const [params, options] = createOpenRouterResponse.mock.calls[0] as unknown as [
      Record<string, unknown>,
      unknown,
    ]
    expect(options).toEqual({ maxRetries: 1 })
    expect(params).toMatchObject({
      instructions: 'Decide.',
      max_output_tokens: 300,
      tool_choice: 'required',
      safety_identifier: 'actor',
      prompt_cache_key: 'cache-v1',
      service_tier: 'flex',
      tools: [{ type: 'function', name: 'search_topics', strict: false }],
      input: [
        { role: 'user', content: 'Which topics?' },
        { role: 'assistant', content: 'Let me look.' },
        {
          type: 'function_call',
          call_id: 'call_1',
          name: 'search_topics',
          arguments: '{"query":"rust"}',
        },
        { type: 'function_call_output', call_id: 'call_1', output: '{"topics":[]}' },
      ],
    })
    expect(result).toMatchObject({
      provider: 'openai',
      transport: 'openrouter',
      responseId: 'resp_1',
      output: {
        text: 'Looking.',
        toolCalls: [{ id: 'call_9', name: 'search_topics', input: { query: 'go' } }],
      },
    })
  })

  it('uses OpenAI directly when that transport is selected', async () => {
    const createOpenAIResponse = vi
      .fn<CreateOpenAI>()
      .mockResolvedValue(openAIResponse([functionCall]) as never)

    const result = await callOpenAIToolTurn(
      'gpt-6-luna',
      'direct',
      {
        ...request,
        maxRetries: undefined,
        flex: false,
        safetyIdentifier: undefined,
        promptCacheKey: undefined,
      },
      { createOpenAIResponse },
    )

    const [params, options] = createOpenAIResponse.mock.calls[0] as unknown as [
      Record<string, unknown>,
      unknown,
    ]
    expect(options).toBeUndefined()
    expect(params).toMatchObject({ model: 'gpt-6-luna' })
    expect(params).not.toHaveProperty('service_tier')
    expect(result.transport).toBe('direct')
  })

  it('bills a turn whose tool arguments are not JSON or that made no call', async () => {
    const malformed = vi
      .fn<CreateOpenRouter>()
      .mockResolvedValue(openAIResponse([{ ...functionCall, arguments: '{' }]) as never)
    const empty = vi.fn<CreateOpenRouter>().mockResolvedValue({
      ...openAIResponse([]),
      usage: undefined,
      service_tier: undefined,
      model: undefined,
    } as never)

    await expect(
      callOpenAIToolTurn('gpt-6-luna', 'openrouter', request, {
        createOpenRouterResponse: malformed,
      }),
    ).rejects.toMatchObject({ code: 'invalid-response', billedResponse: { responseId: 'resp_1' } })
    await expect(
      callOpenAIToolTurn('gpt-6-luna', 'openrouter', request, { createOpenRouterResponse: empty }),
    ).rejects.toMatchObject({
      code: 'invalid-response',
      billedResponse: { model: 'gpt-6-luna', serviceTier: 'unknown-tier' },
    })
  })

  it.each([
    ['only a retry budget', { maxRetries: 2 }, undefined, { maxRetries: 2 }],
    ['only a signal', { maxRetries: undefined }, new AbortController().signal, undefined],
  ])('passes %s to the SDK options', async (_name, requestOverrides, signal, expected) => {
    const createOpenRouterResponse = vi
      .fn<CreateOpenRouter>()
      .mockResolvedValue(openAIResponse([functionCall]) as never)

    await callOpenAIToolTurn(
      'gpt-6-luna',
      'openrouter',
      { ...request, ...requestOverrides },
      { createOpenRouterResponse },
      signal,
    )

    const [, options] = createOpenRouterResponse.mock.calls[0] as unknown as [unknown, unknown]
    expect(options).toEqual(expected ?? { signal })
  })
})
