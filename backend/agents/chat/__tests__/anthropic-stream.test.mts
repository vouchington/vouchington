import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetch as undiciFetch, Response as UndiciResponse } from 'undici'
import { getLongRunningExternalRequestDispatcher } from '@modules/utils/http-dispatchers'

import { streamAnthropicChat } from '../anthropic-stream.mts'
import type { ChatHistoryMessage } from '../build-input.mts'

const originalAnthropicApiKey = process.env.ANTHROPIC_API_KEY
type Fetch = typeof undiciFetch

function sseResponse(chunks: string[], init: ResponseInit = {}): UndiciResponse {
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(encoder.encode(chunk))
      controller.close()
    },
  })
  return new UndiciResponse(stream, { status: 200, ...init })
}

async function collectAnthropicEvents(
  fetch?: Fetch,
  input: ChatHistoryMessage[] = [{ role: 'user', content: 'Hello' }],
): Promise<unknown[]> {
  const events: unknown[] = []
  for await (const event of streamAnthropicChat({
    systemPrompt: 'System',
    input,
    fetch,
  })) {
    events.push(event)
  }
  return events
}

describe('streamAnthropicChat', () => {
  afterEach(() => {
    if (originalAnthropicApiKey === undefined) {
      delete process.env.ANTHROPIC_API_KEY
    } else {
      process.env.ANTHROPIC_API_KEY = originalAnthropicApiKey
    }
  })

  it('sends typed user and assistant turns while keeping the system prompt separate', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    const fetch = vi.fn<Fetch>().mockResolvedValue(sseResponse([]))
    const input: ChatHistoryMessage[] = [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
      { role: 'user', content: 'Follow-up question' },
    ]

    await collectAnthropicEvents(fetch, input)

    const [, init] = fetch.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({
      system: 'System',
      messages: input,
    })
  })

  it('drops leading assistant turns before sending Anthropic messages', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    const fetch = vi.fn<Fetch>().mockResolvedValue(sseResponse([]))
    const input: ChatHistoryMessage[] = [
      { role: 'assistant', content: 'Truncated question answer' },
      { role: 'assistant', content: 'Another leading answer' },
      { role: 'user', content: 'First retained question' },
      { role: 'assistant', content: 'Retained answer' },
    ]

    await collectAnthropicEvents(fetch, input)

    const [, init] = fetch.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({
      messages: [
        { role: 'user', content: 'First retained question' },
        { role: 'assistant', content: 'Retained answer' },
      ],
    })
  })

  it('preserves consecutive user turns in their original order', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    const fetch = vi.fn<Fetch>().mockResolvedValue(sseResponse([]))
    const input: ChatHistoryMessage[] = [
      { role: 'user', content: 'First user turn' },
      { role: 'user', content: 'Second user turn' },
      { role: 'assistant', content: 'Assistant answer' },
    ]

    await collectAnthropicEvents(fetch, input)

    const [, init] = fetch.mock.calls[0] ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({ messages: input })
  })

  it('streams text deltas and sends the expected Messages API payload', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValue(
        sseResponse([
          'event: message_start\ndata: {"type":"message_start"}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\n\n',
          'event: ping\ndata: {"type":"ping"}\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\n\n',
        ]),
      )
    await expect(collectAnthropicEvents(fetch)).resolves.toEqual([
      { type: 'text', content: 'Hel' },
      { type: 'text', content: 'lo' },
    ])

    const [url, init] = fetch.mock.calls[0] ?? []
    expect(url).toBe('https://api.anthropic.com/v1/messages')
    expect(init?.dispatcher).toBe(getLongRunningExternalRequestDispatcher())
    expect(init?.headers).toMatchObject({
      'x-api-key': 'test-anthropic-key',
      'anthropic-version': '2023-06-01',
    })
    expect(JSON.parse(String(init?.body))).toMatchObject({
      model: 'claude-sonnet-5',
      thinking: { type: 'disabled' },
      stream: true,
      system: 'System',
      messages: [{ role: 'user', content: 'Hello' }],
    })
  })

  it('streams CRLF-delimited text deltas split across chunks', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValue(
        sseResponse([
          'event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hel"}}\r',
          '\n\r\n',
          'event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"lo"}}\r\n\r\n',
        ]),
      )

    await expect(collectAnthropicEvents(fetch)).resolves.toEqual([
      { type: 'text', content: 'Hel' },
      { type: 'text', content: 'lo' },
    ])
  })

  it('streams mixed LF and CRLF-delimited text deltas', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'
    const fetch = vi
      .fn<Fetch>()
      .mockResolvedValue(
        sseResponse([
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"one"}}\n\n' +
            'event: content_block_delta\r\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"two"}}\r\n\r\n',
        ]),
      )

    await expect(collectAnthropicEvents(fetch)).resolves.toEqual([
      { type: 'text', content: 'one' },
      { type: 'text', content: 'two' },
    ])
  })

  it('handles trailing data, API failures, missing response bodies, and stream errors', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-anthropic-key'

    let fetch = vi
      .fn<Fetch>()
      .mockResolvedValue(
        sseResponse([
          'event: content_block_delta\ndata: not-json\n\n',
          'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"tail"}}',
        ]),
      )
    await expect(collectAnthropicEvents(fetch)).resolves.toEqual([
      { type: 'text', content: 'tail' },
    ])

    fetch = vi.fn<Fetch>().mockResolvedValue(new UndiciResponse('bad request', { status: 400 }))
    await expect(collectAnthropicEvents(fetch)).rejects.toThrow(
      'Anthropic request failed with 400: bad request',
    )

    fetch = vi.fn<Fetch>().mockResolvedValue(new UndiciResponse(null, { status: 200 }))
    await expect(collectAnthropicEvents(fetch)).rejects.toThrow(
      'Anthropic stream response body was empty',
    )

    fetch = vi
      .fn<Fetch>()
      .mockResolvedValue(
        sseResponse(['data: {"type":"error","error":{"message":"rate limited"}}\n\n']),
      )
    await expect(collectAnthropicEvents(fetch)).rejects.toThrow('rate limited')
  })

  it('requires an Anthropic API key before calling fetch', async () => {
    delete process.env.ANTHROPIC_API_KEY
    const fetch = vi.fn<Fetch>()

    await expect(collectAnthropicEvents(fetch)).rejects.toThrow('ANTHROPIC_API_KEY is not set')
    expect(fetch).not.toHaveBeenCalled()
  })
})
