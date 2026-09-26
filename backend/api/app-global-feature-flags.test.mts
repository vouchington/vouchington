import { describe, expect, it, vi, afterEach } from 'vitest'
import request, { type Test } from 'supertest'
import { isUUIDv7, mintUUIDv7 } from '@ts-shared/session-jwt'
import { getFeatureFlags } from '@services/feature-flags'
import { getOptionalRequestClientInfo } from '@modules/request-client-info'
import app from './app.mts'
import { createOriginGuardedListener } from './app-origin-guard.mts'
import { createRequestClientInfoListener } from '@modules/request-client-info/listener'
import './v1/feature-flags/feature-flags.mts'

const WORKER_SECRET = '0123456789abcdef0123456789abcdef'
const FLAG_KIND = 'global-feature-flags'
const FLAG_PATH = '/api/v1/feature-flags'

function guardedRequest(
  secret: string | undefined,
  observeClientInfo?: (info: ReturnType<typeof getOptionalRequestClientInfo>) => void,
) {
  const apiListener = app.callback()
  return request(
    createOriginGuardedListener(
      createRequestClientInfoListener(
        (req, res) => {
          observeClientInfo?.(getOptionalRequestClientInfo())
          apiListener(req, res)
        },
        {
          isEnforced: () => true,
          mintDeviceId: mintUUIDv7,
          verifyDeviceIdentity: async () => null,
        },
      ),
      secret,
    ),
  )
}

function setWebMetadata(call: Test): Test {
  return call
    .set('x-voucha-client', 'web')
    .set('x-voucha-platform', 'web')
    .set('x-voucha-app-version', 'test')
    .set('x-forwarded-for', '198.51.100.42')
}

describe('authenticated global feature-flag bootstrap', () => {
  afterEach(vi.restoreAllMocks)
  afterEach(vi.unstubAllEnvs)

  it('serves the actual global flags with enforcement on and no warning', async () => {
    vi.stubEnv('NODE_ENV', 'development')
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    let observedClientInfo: ReturnType<typeof getOptionalRequestClientInfo>
    const response = await setWebMetadata(
      guardedRequest(WORKER_SECRET, info => {
        observedClientInfo = info
      }).get(FLAG_PATH),
    )
      .set('x-cf-worker-secret', WORKER_SECRET)
      .set('x-voucha-request-kind', FLAG_KIND)
      .expect(200)

    expect(response.body).toEqual({ flags: getFeatureFlags(), overrides: {} })
    expect(observedClientInfo).toMatchObject({
      client: 'web',
      platform: 'web',
      ipAddress: '198.51.100.42',
    })
    expect(isUUIDv7(observedClientInfo?.deviceId ?? '')).toBe(true)
    expect(warn).not.toHaveBeenCalledWith(
      'Invalid request client information observed',
      expect.anything(),
    )
  })

  it.each([undefined, 'wrong-secret'])(
    'rejects direct origin spoof with secret %s',
    async secret => {
      const call = setWebMetadata(guardedRequest(WORKER_SECRET).get(FLAG_PATH)).set(
        'x-voucha-request-kind',
        FLAG_KIND,
      )
      if (secret) call.set('x-cf-worker-secret', secret)
      const response = await call.expect(403)
      expect(response.text).toBe('Forbidden')
    },
  )

  it.each([
    ['GET', '/api/v1/feature-flags/other', undefined, 'web'],
    ['POST', FLAG_PATH, undefined, 'web'],
    ['GET', FLAG_PATH, 'ff=abc', 'web'],
    ['GET', FLAG_PATH, undefined, 'swift'],
  ])(
    'does not bootstrap %s %s with cookie %s and client %s',
    async (method, path, cookie, client) => {
      const agent = guardedRequest(WORKER_SECRET)
      const call = setWebMetadata(method === 'POST' ? agent.post(path) : agent.get(path))
        .set('x-cf-worker-secret', WORKER_SECRET)
        .set('x-voucha-request-kind', FLAG_KIND)
        .set('x-voucha-client', client)
        .set('x-voucha-platform', client === 'swift' ? 'ios' : 'web')
      if (cookie) call.set('Cookie', cookie)
      const response = await call
      expect(response.status).toBe(400)
      expect(response.body.code).toBe('INVALID_CLIENT_INFO')
    },
  )

  it('does not bootstrap when origin authentication is disabled', async () => {
    const response = await setWebMetadata(guardedRequest(undefined).get(FLAG_PATH))
      .set('x-voucha-request-kind', FLAG_KIND)
      .expect(400)
    expect(response.body.code).toBe('INVALID_CLIENT_INFO')
  })

  it.each([undefined, 'other-kind'])(
    'does not bootstrap without the exact request kind (%s)',
    async kind => {
      const call = setWebMetadata(guardedRequest(WORKER_SECRET).get(FLAG_PATH)).set(
        'x-cf-worker-secret',
        WORKER_SECRET,
      )
      if (kind) call.set('x-voucha-request-kind', kind)
      const response = await call.expect(400)
      expect(response.body.code).toBe('INVALID_CLIENT_INFO')
    },
  )

  it.each([
    ['x-voucha-app-version', ''],
    ['x-forwarded-for', 'not-an-ip'],
  ])('still validates %s on the internal global read', async (header, value) => {
    const response = await setWebMetadata(guardedRequest(WORKER_SECRET).get(FLAG_PATH))
      .set('x-cf-worker-secret', WORKER_SECRET)
      .set('x-voucha-request-kind', FLAG_KIND)
      .set(header, value)
      .expect(400)
    expect(response.body.code).toBe('INVALID_CLIENT_INFO')
  })
})
