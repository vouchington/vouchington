import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSentryTunnel as handleConfiguredSentryTunnel } from './sentry-tunnel.mts'

const INVALID_PROJECT_DSN = 'https://secret_dsn_key@example.test/999'
const TUNNEL_ENV = { SENTRY_WEB_DSN: 'https://public@example.test/123' }

function handleSentryTunnel(request: Request): Promise<Response> {
  return handleConfiguredSentryTunnel(request, TUNNEL_ENV)
}

function makeEnvelope(dsn = INVALID_PROJECT_DSN) {
  return [
    `{"dsn":"${dsn}","sdk":{"name":"sentry.javascript.nextjs"}}`,
    '{"type":"event"}',
    '{}',
  ].join('\n')
}

function makeRequest(body: string, headers?: HeadersInit) {
  return new Request('https://example.com/monitoring', { method: 'POST', body, headers })
}

function makeCloudflareRayRequest(body: string, ray: string, headers?: HeadersInit) {
  const request = makeRequest(body, headers)
  Object.defineProperty(request, 'cf', {
    value: { ray },
  })
  return request
}

describe('Sentry tunnel diagnostics', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('logs structured rejection diagnostics without envelope data', async () => {
    const res = await handleSentryTunnel(makeRequest(makeEnvelope(), { 'cf-ray': 'abc123-SJC' }))

    expect(res.status).toBe(403)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const logged = warnSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('secret-dsn-key')
    expect(logged).not.toContain('9999999999')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_rejected',
      reason: 'dsn_not_allowed',
      status: 403,
      method: 'POST',
      requestPath: '/monitoring',
      cfRay: 'abc123-SJC',
    })
  })

  it('prefers the Cloudflare request Ray ID over the header fallback', async () => {
    const res = await handleSentryTunnel(
      makeCloudflareRayRequest(makeEnvelope(), 'edge-ray-SJC', { 'cf-ray': 'header-ray-SJC' }),
    )

    expect(res.status).toBe(403)
    expect(warnSpy).toHaveBeenCalledTimes(1)
    const logged = warnSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(JSON.parse(logged as string)).toMatchObject({
      message: 'sentry_tunnel_rejected',
      cfRay: 'edge-ray-SJC',
    })
  })
})
