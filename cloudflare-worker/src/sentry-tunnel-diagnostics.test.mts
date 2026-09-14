import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { handleSentryTunnel as handleConfiguredSentryTunnel } from './sentry-tunnel.mts'
import { logSentryTunnelForwardFailure } from './sentry-tunnel-diagnostics.mts'

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
  let errorSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
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

  it('logs safe top-level forwarding error codes without error messages', () => {
    const error = Object.assign(new TypeError('connection timeout contacting Sentry'), {
      code: 'UND_ERR_CONNECT_TIMEOUT',
    })

    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('connection timeout contacting Sentry')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'TypeError',
      errorCode: 'UND_ERR_CONNECT_TIMEOUT',
    })
  })

  it('ignores non-scalar forwarding error codes', () => {
    const error = Object.assign(new TypeError('wrapped failure'), {
      code: { value: 'SECRET_FROM_ERROR_OBJECT' },
    })

    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('SECRET_FROM_ERROR_OBJECT')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'TypeError',
    })
  })

  it('ignores forwarding error codes when diagnostic property access throws', () => {
    const error = new TypeError('wrapped failure')
    Object.defineProperty(error, 'code', {
      get() {
        throw new Error('SECRET_FROM_THROWING_GETTER')
      },
    })

    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('SECRET_FROM_THROWING_GETTER')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'TypeError',
    })
  })

  it('logs forwarding error codes from plain object causes', () => {
    const error = new TypeError('wrapped failure', {
      cause: { code: 'ECONNRESET' },
    })

    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'TypeError',
      errorCode: 'ECONNRESET',
    })
  })

  it('logs non-error thrown values without code diagnostics', () => {
    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', 'string failure')

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('string failure')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'string',
    })
  })

  it('ignores forwarding error causes when cause property access throws', () => {
    const error = new TypeError('wrapped failure')
    Object.defineProperty(error, 'cause', {
      get() {
        throw new Error('SECRET_FROM_THROWING_CAUSE_GETTER')
      },
    })

    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('SECRET_FROM_THROWING_CAUSE_GETTER')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'TypeError',
    })
  })

  it('logs forwarding error codes from proxy causes with throwing prototype traps', () => {
    const cause = new Proxy(
      { code: 'ECONNRESET' },
      {
        getPrototypeOf() {
          throw new Error('SECRET_FROM_THROWING_PROTOTYPE_TRAP')
        },
      },
    )
    const error = new TypeError('wrapped failure', { cause })

    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('SECRET_FROM_THROWING_PROTOTYPE_TRAP')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'TypeError',
      errorCode: 'ECONNRESET',
    })
  })

  it('ignores forwarding error cause names when name property access throws', () => {
    const cause = Object.assign(new Error('socket reset while contacting Sentry'), {
      code: 'ECONNRESET',
    })
    Object.defineProperty(cause, 'name', {
      get() {
        throw new Error('SECRET_FROM_THROWING_NAME_GETTER')
      },
    })
    const error = new TypeError('wrapped failure', { cause })

    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(logged).not.toContain('SECRET_FROM_THROWING_NAME_GETTER')
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'TypeError',
      errorCode: 'ECONNRESET',
    })
  })

  it('logs numeric forwarding error codes', () => {
    const error = Object.assign(new TypeError('numeric code failure'), {
      code: 500,
    })

    logSentryTunnelForwardFailure(makeRequest(makeEnvelope()), '123', error)

    expect(errorSpy).toHaveBeenCalledTimes(1)
    const logged = errorSpy.mock.calls[0]?.[0]
    expect(logged).toEqual(expect.any(String))
    expect(JSON.parse(logged as string)).toEqual({
      message: 'sentry_tunnel_forward_failed',
      reason: 'sentry_fetch_error',
      status: 502,
      method: 'POST',
      requestPath: '/monitoring',
      projectId: '123',
      errorName: 'TypeError',
      errorCode: '500',
    })
  })
})
