import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { loadRecordedResponse } from '../../test-helpers/provider-replay.mts'
import { generateToolTurn } from './tool-turn.mts'

// A recorded Messages API tool_use response is served through the real Anthropic SDK's `fetch`
// option, so the SDK builds the request and parses the wire body. It is hand-written from
// Anthropic's documented format. The live counterpart is the non-gating smoke check in
// generate.anthropic.test.mts.
const replay = await vi.hoisted(async () => {
  const { createProviderReplay } = await import('../../test-helpers/provider-replay.mts')
  return createProviderReplay()
})

vi.mock<typeof import('@anthropic-ai/sdk')>(import('@anthropic-ai/sdk'), async importOriginal => {
  const actual = await importOriginal()
  const { replayClient } = await import('../../test-helpers/provider-replay.mts')
  return { ...actual, default: replayClient(actual.default, replay) }
})

describe('generateToolTurn against a recorded Anthropic tool_use response', () => {
  beforeEach(() => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-key')
    vi.stubEnv('ANTHROPIC_AUTH_TOKEN', '')
    replay.reset()
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('requires a tool call and returns the parsed call with billed usage', async () => {
    replay.respondWith(loadRecordedResponse('anthropic/messages-tool-use.http'))

    const result = await generateToolTurn(
      { provider: 'anthropic', model: 'claude-haiku-5-5' },
      {
        instructions: 'Decide.',
        messages: [
          { role: 'user', text: 'Which topics?' },
          {
            role: 'assistant',
            text: 'I will look.',
            toolCalls: [{ id: 'call_1', name: 'lookup_topics', input: { query: 'rust' } }],
          },
          {
            role: 'tool',
            results: [{ callId: 'call_1', content: '{"topics":[]}', isError: true }],
          },
        ],
        tools: [
          {
            name: 'lookup_topics',
            description: 'Search.',
            inputSchema: { type: 'object', properties: { query: { type: 'string' } } },
          },
        ],
        maxOutputTokens: 300,
      },
      { openaiTransport: 'openrouter' },
    )

    expect(replay.requests).toHaveLength(1)
    expect(replay.requests[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.anthropic.com/v1/messages',
      headers: {
        authorization: 'Bearer test-key',
        'anthropic-version': '2026-10-21',
      },
    })
    expect(replay.requests[0]?.headers).not.toHaveProperty('x-api-key')
    const body = replay.requests[0]?.json()
    expect(body).toMatchObject({
      model: 'claude-haiku-5-5',
      max_tokens: 300,
      tool_choice: { type: 'any' },
      messages: [
        { role: 'user', content: 'Which topics?' },
        {
          role: 'assistant',
          content: [
            { type: 'text', text: 'I will look.' },
            { type: 'tool_use', id: 'call_1', name: 'lookup_topics', input: { query: 'rust' } },
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
    for (const key of ['temperature', 'top_p', 'top_k', 'stream']) {
      expect(body).not.toHaveProperty(key)
    }

    expect(result).toMatchObject({
      provider: 'anthropic',
      responseId: 'msg_01ReplayFixtureToolUse',
      output: {
        text: 'Looking that up.',
        toolCalls: [
          { id: 'toolu_01ReplayLookup', name: 'lookup_topics', input: { query: 'rust' } },
        ],
      },
      usage: { inputTokens: 30, outputTokens: 25 },
    })
    replay.assertDrained()
  })
})
