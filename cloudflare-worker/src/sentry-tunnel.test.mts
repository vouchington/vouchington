import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { handleSentryTunnel } from './sentry-tunnel.mts'

const WEB_DSN = 'https://web_public@web.example.test/123'
const WORKER_DSN = 'https://worker_public@worker.example.test/456'
const TUNNEL_ENV = { SENTRY_DSN: WORKER_DSN, SENTRY_WEB_DSN: WEB_DSN }

function makeEnvelope(dsn: string) {
  return [`{"dsn":"${dsn}"}`, '{"type":"event"}', '{}'].join('\n')
}

function tunnel(envelope: string): Promise<Response> {
  const request = new Request('https://example.com/monitoring', {
    method: 'POST',
    body: envelope,
  })
  return handleSentryTunnel(request, TUNNEL_ENV)
}

describe('handleSentryTunnel trusted DSN selection', () => {
  const ORIGINAL_FETCH = globalThis.fetch

  beforeEach(() => {
    globalThis.fetch = vi.fn<VitestLooseMock>(() =>
      Promise.resolve(new Response('ok', { status: 200 })),
    ) as unknown as typeof fetch
  })

  afterEach(() => {
    globalThis.fetch = ORIGINAL_FETCH
    vi.restoreAllMocks()
  })

  it.each([
    ['web', WEB_DSN, 'https://web.example.test/api/123/envelope/'],
    ['Worker', WORKER_DSN, 'https://worker.example.test/api/456/envelope/'],
  ])('forwards an envelope from the configured %s project', async (_name, dsn, url) => {
    const envelope = makeEnvelope(dsn)
    const res = await tunnel(envelope)

    expect(res.status).toBe(200)
    expect(globalThis.fetch).toHaveBeenCalledWith(
      url,
      expect.objectContaining({ method: 'POST', body: new TextEncoder().encode(envelope) }),
    )
  })

  it('rejects a DSN that is not configured for this Worker', async () => {
    const res = await tunnel(makeEnvelope('https://backend_public@backend.example.test/789'))

    expect(res.status).toBe(403)
    expect(globalThis.fetch).not.toHaveBeenCalled()
  })
})
