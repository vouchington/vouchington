import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleSentryTunnel as handleConfiguredSentryTunnel } from './sentry-tunnel.mts'

const VALID_DSN = 'https://web_public@web.example.test/123'
const WORKER_DSN = 'https://worker_public@worker.example.test/456'
const TUNNEL_ENV = { SENTRY_DSN: WORKER_DSN, SENTRY_WEB_DSN: VALID_DSN }

const handleSentryTunnel = (
  request: Request,
  env: { SENTRY_DSN?: string; SENTRY_WEB_DSN?: string } = TUNNEL_ENV,
): Promise<Response> => handleConfiguredSentryTunnel(request, env)

function makeEnvelope(dsn = VALID_DSN) {
  return [
    `{"dsn":"${dsn}","sdk":{"name":"sentry.javascript.nextjs"}}`,
    '{"type":"event"}',
    '{}',
  ].join('\n')
}

function makeMultiItemEnvelope() {
  return [
    `{"dsn":"${VALID_DSN}","sdk":{"name":"sentry.javascript.nextjs"}}`,
    '{"type":"event","length":2}',
    '{}',
    '{"type":"transaction"}',
    '{}',
  ].join('\n')
}

function makeRequest(body: string, method = 'POST', headers?: HeadersInit) {
  return new Request('https://example.com/monitoring', { method, body, headers })
}

function makeStreamRequest(chunks: string[]) {
  const encoder = new TextEncoder()
  let pullCount = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      const chunk = chunks[pullCount]
      pullCount += 1
      if (chunk === undefined) {
        controller.close()
        return
      }
      controller.enqueue(encoder.encode(chunk))
    },
  })
  const request = new Request('https://example.com/monitoring', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
  return { getPullCount: () => pullCount, request }
}

function makeErrorStreamRequest(initialChunks: string[]) {
  const encoder = new TextEncoder()
  let pullCount = 0
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (pullCount < initialChunks.length) {
        controller.enqueue(encoder.encode(initialChunks[pullCount]))
        pullCount += 1
      } else {
        controller.error(new Error('stream read error'))
      }
    },
  })
  return new Request('https://example.com/monitoring', {
    method: 'POST',
    body: stream,
    duplex: 'half',
  } as RequestInit & { duplex: 'half' })
}

describe('handleSentryTunnel', () => {
  const ORIGINAL_FETCH = globalThis.fetch
  let warnSpy: ReturnType<typeof vi.spyOn>
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok', { status: 200 })),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it('forwards a valid envelope to Sentry and returns a status-only response', async () => {
    const envelope = makeEnvelope()
    const res = await handleSentryTunnel(makeRequest(envelope))

    expect(res.status).toBe(200)
    // Response body is null — Sentry response headers are not forwarded to the client
    expect(await res.text()).toBe('')
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://web.example.test/api/123/envelope/',
      expect.objectContaining({
        method: 'POST',
        body: envelope,
      }),
    )
  })

  it('returns 400 for malformed JSON envelope header', async () => {
    const res = await handleSentryTunnel(makeRequest('not-json\n{}'))
    expect(res.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when reading the envelope body fails', async () => {
    const request = {
      headers: new Headers(),
      text: () => Promise.reject(new Error('body unavailable')),
    } as Request

    const res = await handleSentryTunnel(request)

    expect(res.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when DSN is missing from envelope header', async () => {
    const res = await handleSentryTunnel(makeRequest('{"sdk":"test"}\n{}'))
    expect(res.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when the parsed envelope header is null', async () => {
    const res = await handleSentryTunnel(makeRequest('null\n{}'))
    expect(res.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when DSN is not a valid URL', async () => {
    const res = await handleSentryTunnel(makeRequest(makeEnvelope('not a url')))
    expect(res.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 403 for an unconfigured Sentry DSN host', async () => {
    const envelope = makeEnvelope('https://key@malicious.example.test/123')
    const res = await handleSentryTunnel(makeRequest(envelope))
    expect(res.status).toBe(403)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 403 for an unconfigured Sentry DSN project', async () => {
    const envelope = makeEnvelope('https://key@web.example.test/999')
    const res = await handleSentryTunnel(makeRequest(envelope))
    expect(res.status).toBe(403)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('passes through Sentry status code without forwarding response headers', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('error', { status: 429, headers: { 'retry-after': '60' } })),
    ) as unknown as typeof fetch

    const envelope = makeMultiItemEnvelope()
    const res = await handleSentryTunnel(makeRequest(envelope))
    expect(res.status).toBe(429)
    expect(res.headers.get('cache-control')).toBe('no-store, max-age=0, must-revalidate')
    expect(res.headers.get('cdn-cache-control')).toBe('no-store')
    expect(res.headers.get('cloudflare-cdn-cache-control')).toBe('no-store')
    // Sentry headers must not leak to the client
    expect(res.headers.get('retry-after')).toBeNull()
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const logged = warnSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('web-public')
    expect(logged).not.toContain('retry-after')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_upstream_response',
      reason: 'sentry_upstream_non_2xx',
      status: 429,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      envelopeItemCount: 2,
      envelopeItemTypes: ['event', 'transaction'],
    })
  })

  it('returns 502 when Sentry fetch throws a network error', async () => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.reject(new Error('network error')),
    ) as unknown as typeof fetch

    const envelope = makeEnvelope()
    const res = await handleSentryTunnel(makeRequest(envelope))
    expect(res.status).toBe(502)
  })

  it('logs structured forwarding failures with the allowlisted project id', async () => {
    const cause = Object.assign(new Error('socket reset while contacting Sentry'), {
      code: 'ECONNRESET',
      name: 'SocketError',
    })
    const error = new TypeError('network error from Sentry fetch', { cause })

    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.reject(error),
    ) as unknown as typeof fetch

    const res = await handleSentryTunnel(makeRequest(makeEnvelope()))

    expect(res.status).toBe(502)
    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('web-public')
    expect(logged).not.toContain('network error from Sentry fetch')
    expect(logged).not.toContain('socket reset while contacting Sentry')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      envelopeItemCount: 1,
      envelopeItemTypes: ['event'],
      errorName: 'TypeError',
      errorCauseName: 'SocketError',
      errorCode: 'ECONNRESET',
    })
  })

  it('returns 413 when Content-Length exceeds 1 MB', async () => {
    const req = new Request('https://example.com/monitoring', {
      method: 'POST',
      body: 'x',
      headers: { 'content-length': '1000001' },
    })
    const res = await handleSentryTunnel(req)
    expect(res.status).toBe(413)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 413 when body exceeds 1 MB without Content-Length header', async () => {
    const largeBody = 'x'.repeat(1_000_001)
    const res = await handleSentryTunnel(makeRequest(largeBody))
    expect(res.status).toBe(413)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('stops reading chunked envelopes once the 1 MB cap is exceeded', async () => {
    const { getPullCount, request } = makeStreamRequest([
      'x'.repeat(600_000),
      'x'.repeat(400_001),
      'should-not-be-read',
    ])

    const res = await handleSentryTunnel(request)

    expect(res.status).toBe(413)
    expect(getPullCount()).toBe(2)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('returns 400 when the stream errors mid-read', async () => {
    const request = makeErrorStreamRequest(['some-data'])

    const res = await handleSentryTunnel(request)

    expect(res.status).toBe(400)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })

  it('forwards an envelope from the configured Worker Sentry project', async () => {
    const envelope = makeEnvelope(WORKER_DSN)
    const res = await handleSentryTunnel(makeRequest(envelope))

    expect(res.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://worker.example.test/api/456/envelope/',
      expect.objectContaining({ method: 'POST', body: envelope }),
    )
  })

  it('returns 403 for a private runtime DSN that is not configured for this Worker', async () => {
    const backendDsn = 'https://backend_public@backend.example.test/789'
    const envelope = makeEnvelope(backendDsn)
    const res = await handleSentryTunnel(makeRequest(envelope))

    expect(res.status).toBe(403)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
