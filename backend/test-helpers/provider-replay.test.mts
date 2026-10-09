import { describe, expect, it } from 'vitest'
import {
  createProviderReplay,
  loadRecordedResponse,
  parseRecordedResponse,
  replayClient,
  toReplayResponse,
} from './provider-replay.mts'

const wire = (text: string) => parseRecordedResponse(Buffer.from(text, 'utf8'))

async function readChunks(response: Response): Promise<Buffer[]> {
  const chunks: Buffer[] = []
  for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
    chunks.push(Buffer.from(chunk))
  }
  return chunks
}

describe('recorded provider responses', () => {
  it('parses the status line and headers and keeps the body bytes untouched', () => {
    const body = 'data: {"text":"café"}\r\n\r\n'
    const recorded = wire(
      `HTTP/2 429 Too Many Requests\r\nContent-Type: text/event-stream\r\ncontent-length: 5\r\nTransfer-Encoding: chunked\r\nretry-after: 2\r\n\r\n${body}`,
    )

    expect(recorded.status).toBe(429)
    expect(recorded.statusText).toBe('Too Many Requests')
    expect(recorded.headers).toEqual([
      ['content-type', 'text/event-stream'],
      ['retry-after', '2'],
    ])
    expect(recorded.body.toString('utf8')).toBe(body)
  })

  it('parses a response with LF line endings and no body', () => {
    const recorded = wire('HTTP/1.1 204\nx-request-id: req_1')

    expect(recorded).toMatchObject({ status: 204, statusText: '', body: Buffer.alloc(0) })
    expect(recorded.headers).toEqual([['x-request-id', 'req_1']])
  })

  it('rejects a file that does not start with a status line', () => {
    expect(() => wire('content-type: text/plain\n\nbody')).toThrow(/no HTTP status line/)
  })

  it('replaces literal tokens so a test can keep provider ids unique', () => {
    const recorded = loadRecordedResponse('openai/responses-cancelled.http', {
      replace: { resp_replay_fixture: 'resp_owned_by_this_test' },
    })

    expect(recorded.body.toString('utf8')).toContain('"id":"resp_owned_by_this_test"')
    expect(recorded.body.toString('utf8')).not.toContain('resp_replay_fixture')
  })

  it('streams the body in chunks that can split a multi-byte character', async () => {
    const recorded = wire('HTTP/1.1 200 OK\ncontent-type: text/plain\n\nhéllo wörld')

    const chunks = await readChunks(toReplayResponse(recorded, 3))

    expect(chunks.length).toBeGreaterThan(2)
    expect(Buffer.concat(chunks).equals(recorded.body)).toBe(true)
    expect(chunks.some(chunk => chunk.toString('utf8').includes('�'))).toBe(true)
  })
})

describe('provider replay transport', () => {
  const ok = wire('HTTP/1.1 200 OK\ncontent-type: application/json\n\n{"ok":true}')

  it('answers requests in order and captures what the SDK sent', async () => {
    const replay = createProviderReplay()
    replay.respondWith(ok, wire('HTTP/1.1 404 Not Found\n\n{}'))

    const first = await replay.fetch('https://provider.example.com/v1/things', {
      method: 'POST',
      headers: { Authorization: 'Bearer key', 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'm', stream: true }),
    })
    const second = await replay.fetch(new Request('https://provider.example.com/v1/other'))

    expect(await first.json()).toEqual({ ok: true })
    expect(second.status).toBe(404)
    expect(replay.requests.map(request => request.method)).toEqual(['POST', 'GET'])
    expect(replay.requests[0]?.headers).toMatchObject({ authorization: 'Bearer key' })
    expect(replay.requests[0]?.json()).toEqual({ model: 'm', stream: true })
    expect(replay.requests[1]?.body).toBeUndefined()
    replay.assertDrained()
  })

  it('captures form bodies as bytes', async () => {
    const replay = createProviderReplay()
    replay.respondWith(ok)

    await replay.fetch('https://provider.example.com/v1/charges', {
      method: 'POST',
      body: new URLSearchParams({ amount: '100' }),
    })

    expect(replay.requests[0]?.body?.toString('utf8')).toBe('amount=100')
  })

  it('fails loudly when a request has no recorded response', async () => {
    const replay = createProviderReplay()
    replay.respondWith(ok)
    await replay.fetch('https://provider.example.com/a')

    await expect(replay.fetch('https://provider.example.com/b')).rejects.toThrow(
      /no recorded response for request 2/,
    )
  })

  it('reports a recorded response that was never requested', () => {
    const replay = createProviderReplay()
    replay.respondWith(ok)

    expect(() => replay.assertDrained()).toThrow(/1 recorded response\(s\) unrequested/)
    replay.reset()
    expect(() => replay.assertDrained()).not.toThrow()
    expect(replay.requests).toEqual([])
  })

  it('rejects an aborted request before recording it', async () => {
    const replay = createProviderReplay()
    replay.respondWith(ok)

    await expect(
      replay.fetch('https://provider.example.com/a', { signal: AbortSignal.abort() }),
    ).rejects.toMatchObject({ name: 'AbortError' })
    expect(replay.requests).toEqual([])
  })

  it('rejects a request whose own signal is already aborted', async () => {
    const replay = createProviderReplay()
    replay.respondWith(ok)
    const aborted = new Request('https://provider.example.com/a', { signal: AbortSignal.abort() })

    await expect(replay.fetch(aborted)).rejects.toMatchObject({ name: 'AbortError' })
    expect(replay.requests).toEqual([])
    expect(() => replay.assertDrained()).toThrow(/unrequested/)
  })

  it('forces every client instance through the replay', async () => {
    const replay = createProviderReplay()
    replay.respondWith(ok)
    class Client {
      options: { apiKey: string; fetch?: typeof replay.fetch }
      constructor(options: { apiKey: string; fetch?: typeof replay.fetch }) {
        this.options = options
      }
    }

    const client = new (replayClient(Client, replay))({ apiKey: 'k', fetch: () => fail() })

    expect(client.options.apiKey).toBe('k')
    expect(client.options.fetch).toBe(replay.fetch)
  })
})

function fail(): never {
  throw new Error('the production fetch must not be used')
}
