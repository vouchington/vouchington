import {
  createServer,
  request as sendHttpRequest,
  type IncomingMessage,
  type ServerResponse,
} from 'node:http'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { listenOnEphemeralPort } from '@ts-shared/utils/ephemeral-ports'
import { mintUUIDv7, type DeviceTokenPayload } from '@ts-shared/session-jwt'
import { getOptionalRequestClientInfo } from './index.mts'
import { createRequestClientInfoListener } from './listener.mts'
describe('request client information listener', () => {
  afterEach(vi.unstubAllEnvs)
  afterEach(vi.restoreAllMocks)
  it('builds trusted context and prefers the Worker-stamped forwarded IP', async () => {
    const did = mintUUIDv7()
    const verifyDeviceIdentity = vi.fn<
      (deviceToken: string, sessionToken?: string) => Promise<DeviceTokenPayload>
    >(async () => ({ did }) as DeviceTokenPayload)
    const response = await send({
      headers: validHeaders({
        cookie: 'dt=valid; st=session',
        'cf-connecting-ip': '203.0.113.2',
        'x-forwarded-for': '198.51.100.1, 198.51.100.2',
      }),
      verifyDeviceIdentity,
    })
    expect(verifyDeviceIdentity).toHaveBeenCalledWith('valid', 'session')
    expect(await response.json()).toMatchObject({ deviceId: did, ipAddress: '198.51.100.1' })
  })

  it('falls back to the Cloudflare IP when the forwarded header is absent', async () => {
    const response = await send({
      headers: validHeaders({
        cookie: 'dt=valid',
        'cf-connecting-ip': '203.0.113.2',
        'x-request-id': 'request-1',
      }),
      verifyDeviceIdentity: async () => ({ did: mintUUIDv7() }) as DeviceTokenPayload,
    })
    const body = (await response.json()) as { ipAddress: string; requestId: string }
    expect(body.ipAddress).toBe('203.0.113.2')
    expect(body.requestId).toBe('request-1')
  })

  it('uses the socket IP when forwarding metadata is absent', async () => {
    const response = await send({
      headers: validHeaders({ cookie: 'other=x; dt=token=with=equals' }),
      verifyDeviceIdentity: async token =>
        token === 'token=with=equals' ? ({ did: mintUUIDv7() } as DeviceTokenPayload) : null,
    })
    const body = (await response.json()) as { ipAddress: string }
    expect(body.ipAddress).toMatch(/127\.0\.0\.1/)
  })

  it('rejects invalid metadata with the stable JSON contract in enforce mode', async () => {
    const response = await send({
      headers: { 'x-request-id': 'request-1' },
      isEnforced: () => true,
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      code: 'INVALID_CLIENT_INFO',
      request_id: 'request-1',
    })
  })

  it('rejects invalid or absent trusted IP addresses in enforce mode', async () => {
    const response = await send({
      headers: validHeaders({ cookie: 'dt=valid', 'cf-connecting-ip': 'not-an-ip' }),
      isEnforced: () => true,
      verifyDeviceIdentity: async () => ({ did: mintUUIDv7() }) as DeviceTokenPayload,
    })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({ code: 'INVALID_CLIENT_INFO' })
  })

  it('rejects valid metadata without a verified device identity', async () => {
    const response = await send({ headers: validHeaders(), isEnforced: () => true })
    expect(response.status).toBe(400)
    expect(await response.json()).toMatchObject({
      message: 'a verified device token is required',
      code: 'INVALID_CLIENT_INFO',
    })
  })

  it('omits a request ID and normalizes non-Error failures', async () => {
    const response = await send({
      headers: validHeaders({ cookie: 'dt=valid' }),
      isEnforced: () => true,
      verifyDeviceIdentity: async () => Promise.reject('invalid'),
    })
    expect(await response.json()).toEqual({
      message: 'Invalid client information',
      code: 'INVALID_CLIENT_INFO',
    })
  })

  it('accepts invalid metadata without client information in observe mode', async () => {
    const response = await send({ headers: {}, isEnforced: () => false })
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })

  it('logs observe and enforce validation failures outside tests', async () => {
    const warn = vi.spyOn(console, 'warn').mockReturnValue(undefined)
    vi.stubEnv('NODE_ENV', 'development')
    await send({ headers: {}, isEnforced: () => false })
    await send({
      headers: validHeaders({ cookie: 'dt=valid' }),
      isEnforced: () => true,
      verifyDeviceIdentity: async () => Promise.reject('invalid'),
    })
    expect(warn).toHaveBeenCalledTimes(2)
    expect(warn).toHaveBeenLastCalledWith(
      'Invalid request client information observed',
      expect.objectContaining({ reason: 'unknown' }),
    )
  })

  it('uses the default observe-mode dependencies', async () => {
    const response = await send({ headers: {}, useDefaultDependencies: true })
    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })

  it('shares the session bootstrap device ID with request context', async () => {
    const did = mintUUIDv7()
    const response = await send({
      method: 'PATCH',
      path: '/api/v1/session',
      headers: validHeaders({ 'x-forwarded-for': '198.51.100.1' }),
      isEnforced: () => true,
      mintDeviceId: () => did,
    })
    expect(await response.json()).toMatchObject({ deviceId: did })
  })

  it('bootstraps when a present device token fails verification', async () => {
    const did = mintUUIDv7()
    const response = await send({
      method: 'PATCH',
      path: '/api/v1/session',
      headers: validHeaders({ cookie: 'dt=invalid', 'x-forwarded-for': '198.51.100.1' }),
      isEnforced: () => true,
      mintDeviceId: () => did,
      verifyDeviceIdentity: async () => null,
    })
    expect(await response.json()).toMatchObject({ deviceId: did })
  })

  it.each(['/api/v1/auth/email-address/tokens', '/api/v1/app-attestation/challenge'])(
    'bootstraps native POST %s with client metadata but no device cookie',
    async path => {
      const did = mintUUIDv7()
      const response = await send({
        method: 'POST',
        path,
        headers: validHeaders({ 'x-forwarded-for': '198.51.100.1' }),
        isEnforced: () => true,
        mintDeviceId: () => did,
      })
      expect(await response.json()).toMatchObject({ deviceId: did })
    },
  )

  it('does not bootstrap unlisted authentication requests', async () => {
    const response = await send({
      method: 'POST',
      path: '/api/v1/auth/future-route',
      headers: validHeaders({ 'x-forwarded-for': '198.51.100.1' }),
      isEnforced: () => true,
    })
    expect(response.status).toBe(400)
  })

  it.each([
    ['OPTIONS', '/api/v1/posts', {}],
    ['GET', '/infra/ping', {}],
    ['GET', '/api/v1/mcp', {}],
    ['GET', '/api/v1/admin/mcp/tools', {}],
    ['POST', '/api/v1/email-unsubscribe', {}],
    ['GET', '/api/v1/posts', { 'x-voucha-request-kind': 'bot' }],
    ['GET', '/api/v1/posts', { 'x-voucha-request-kind': 'cache-fill' }],
  ])('exempts %s %s trusted traffic', async (method, path, headers) => {
    const response = await send({ method, path, headers, isEnforced: () => true })
    expect(response.status).toBe(200)
  })

  it('does not exempt unknown request kinds or prefix lookalikes', async () => {
    for (const path of ['/api/v1/webhooks-malicious', '/api/v1/mcp-tools']) {
      const response = await send({
        path,
        headers: validHeaders({ cookie: 'dt=valid', 'x-voucha-request-kind': 'unknown' }),
        verifyDeviceIdentity: async () => ({ did: mintUUIDv7() }) as DeviceTokenPayload,
      })
      expect(response.status).toBe(200)
      expect(await response.json()).not.toBeNull()
    }
  })

  it('handles missing URLs and duplicate trusted-kind headers defensively', async () => {
    const next = vi.fn<(req: IncomingMessage, res: ServerResponse) => void>()
    const listener = createRequestClientInfoListener(next, {
      isEnforced: () => true,
      mintDeviceId: mintUUIDv7,
      verifyDeviceIdentity: async () => null,
    })
    listener({ method: 'GET', headers: {}, socket: {} } as IncomingMessage, {} as ServerResponse)
    expect(next).toHaveBeenCalledOnce()

    await new Promise<void>(resolve => {
      listener(
        {
          method: 'GET',
          url: '/api/v1/posts',
          headers: {
            ...validHeaders(),
            'x-voucha-request-kind': ['bot', 'cache-fill'],
          },
          socket: { remoteAddress: '127.0.0.1' },
        } as unknown as IncomingMessage,
        {
          writeHead: vi.fn<ServerResponse['writeHead']>(),
          end: () => resolve(),
        } as unknown as ServerResponse,
      )
    })
    expect(next).toHaveBeenCalledOnce()
  })
})

type SendOptions = {
  method?: string
  path?: string
  headers: Record<string, string>
  isEnforced?: () => boolean
  mintDeviceId?: () => string
  verifyDeviceIdentity?: (
    token: string,
    sessionToken?: string,
  ) => Promise<DeviceTokenPayload | null>
  useDefaultDependencies?: boolean
}

async function send(options: SendOptions): Promise<Response> {
  const server = createServer(
    createRequestClientInfoListener(
      (_req, res) => {
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify(getOptionalRequestClientInfo() ?? null))
      },
      options.useDefaultDependencies
        ? undefined
        : {
            isEnforced: options.isEnforced ?? (() => true),
            mintDeviceId: options.mintDeviceId ?? mintUUIDv7,
            verifyDeviceIdentity: options.verifyDeviceIdentity ?? (async () => null),
          },
    ),
  )
  const port = await listenOnEphemeralPort(server, '127.0.0.1')
  try {
    return await new Promise<Response>((resolve, reject) => {
      const request = sendHttpRequest({
        host: '127.0.0.1',
        port,
        path: options.path ?? '/api/v1/posts',
        method: options.method,
        headers: options.headers,
      })
      request.on('response', response => {
        const body: Buffer[] = []
        response.on('data', chunk => body.push(Buffer.from(chunk)))
        response.on('end', () =>
          resolve(new Response(Buffer.concat(body), { status: response.statusCode ?? 500 })),
        )
      })
      request.on('error', reject)
      request.end()
    })
  } finally {
    server.close()
  }
}

function validHeaders(overrides: Record<string, string> = {}): Record<string, string> {
  return {
    'x-voucha-client': 'web',
    'x-voucha-platform': 'web',
    'x-voucha-app-version': 'test',
    ...overrides,
  }
}
