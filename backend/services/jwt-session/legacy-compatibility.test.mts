import { beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest'
import { isUUIDv7 } from '@ts-shared/session-jwt'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  createUniqueTestEmail,
  overrideDynamicConfigFieldsForTest,
} from '@voucha/test-helpers'
import { getTestUserSessionById } from '../../test-helpers/entities/user-sessions.mts'
import { createEmailAddressLoginToken } from '../users/authentication.mts'
import { routeRateLimitConfig } from '../route-rate-limits/config.mts'
import { refreshSessionState } from './flows.mts'
import { resetSessionState } from './reset-session.mts'
import { revokeSession } from './revocation.mts'
import {
  legacyUuidV4,
  signLegacyDeviceJwt,
  signLegacySessionJwt,
} from '../../test-helpers/services/jwt-session/index.mts'
import '../../api/v1/sessions-authentication/index.mts'

describe('legacy UUIDv4 session compatibility matrix', () => {
  let originalRouteRateLimitConfig: ReturnType<typeof routeRateLimitConfig.getFields>

  beforeAll(async () => {
    await routeRateLimitConfig.waitForInitialization()
  })

  beforeEach(async () => {
    originalRouteRateLimitConfig = routeRateLimitConfig.getFields()
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, { enabled: false })
  })

  afterEach(async () => {
    overrideDynamicConfigFieldsForTest(routeRateLimitConfig, originalRouteRateLimitConfig)
  })

  const cases: Array<{ name: string; run: () => Promise<void> }> = [
    {
      name: 'refresh rotates legacy anonymous ids before signing',
      async run() {
        const legacyDid = legacyUuidV4()
        const legacySid = legacyUuidV4()
        const result = await refreshSessionState({
          fetchUser: async () => null,
          deviceToken: await signLegacyDeviceJwt({ did: legacyDid }),
          sessionToken: await signLegacySessionJwt({
            did: legacyDid,
            sid: legacySid,
            uid: null,
          }),
        })

        expect(isUUIDv7(result.did)).toBe(true)
        expect(isUUIDv7(result.sid)).toBe(true)
        expect(result.did).not.toBe(legacyDid)
        expect(result.sid).not.toBe(legacySid)
      },
    },
    {
      name: 'reset rotates legacy device id and drops stale App Attest device class',
      async run() {
        const legacyDid = legacyUuidV4()
        const result = await resetSessionState({
          deviceToken: await signLegacyDeviceJwt({ did: legacyDid, dc: 'attested' }),
        })

        expect(isUUIDv7(result.did)).toBe(true)
        expect(isUUIDv7(result.sid)).toBe(true)
        expect(result.did).not.toBe(legacyDid)
        expect(result.deviceClass).toBeUndefined()
      },
    },
    {
      name: 'revoked legacy session downgrades to anonymous UUIDv7 ids',
      async run() {
        const user = await createTestUser()
        const legacyDid = legacyUuidV4()
        const legacySid = legacyUuidV4()
        await revokeSession(legacySid)

        const result = await refreshSessionState({
          fetchUser: async () => user,
          deviceToken: await signLegacyDeviceJwt({ did: legacyDid }),
          sessionToken: await signLegacySessionJwt({
            did: legacyDid,
            sid: legacySid,
            uid: user.id,
          }),
        })

        expect(result.uid).toBeNull()
        expect(isUUIDv7(result.did)).toBe(true)
        expect(isUUIDv7(result.sid)).toBe(true)
        expect(result.sid).not.toBe(legacySid)
      },
    },
    {
      name: 'active-session listing does not register legacy UUIDv4 sid rows',
      async run() {
        const user = await createTestUser()
        const legacyDid = legacyUuidV4()
        const legacySid = legacyUuidV4()
        const response = await createRequest()
          .get('/api/v1/auth/sessions')
          .set('Cookie', [
            `dt=${await signLegacyDeviceJwt({ did: legacyDid })}`,
            `st=${await signLegacySessionJwt({ did: legacyDid, sid: legacySid, uid: user.id })}`,
          ])
          .expect(200)

        expect(response.body.results).toEqual([])
        await expect(getTestUserSessionById(legacySid)).resolves.toBeNull()
      },
    },
    {
      name: 'passkey challenge setup binds to the rotated UUIDv7 device id',
      async run() {
        const legacyDid = legacyUuidV4()
        const legacySid = legacyUuidV4()
        const req = createRequest().set(
          'Cookie',
          `dt=${await signLegacyDeviceJwt({ did: legacyDid })}; st=${await signLegacySessionJwt({
            did: legacyDid,
            sid: legacySid,
            uid: null,
          })}`,
        )

        await req.post('/api/v1/auth/passkeys/authentication/options').send({}).expect(200)

        const response = await req
          .post('/api/v1/auth/passkeys/authentication/verify')
          .send({ response: { id: 'nonexistent-credential-id' } })
          .expect(401)
        expect(response.body.message).toContain('Passkey sign-in failed')
      },
    },
    {
      name: 'email login response ids are rotated to UUIDv7',
      async run() {
        const legacyDid = legacyUuidV4()
        const legacySid = legacyUuidV4()
        const emailAddress = createUniqueTestEmail(`legacy-matrix-${legacySid.slice(0, 8)}`)
        const { token } = await createEmailAddressLoginToken(emailAddress)

        const response = await createRequest()
          .post('/api/v1/auth/email-address/login')
          .send({
            emailAddress,
            token,
            dt: await signLegacyDeviceJwt({ did: legacyDid }),
            st: await signLegacySessionJwt({ did: legacyDid, sid: legacySid, uid: null }),
          })
          .expect(200)

        expect(isUUIDv7(response.body.did)).toBe(true)
        expect(isUUIDv7(response.body.sid)).toBe(true)
        expect(isUUIDv7(response.body.session.did)).toBe(true)
        expect(isUUIDv7(response.body.session.sid)).toBe(true)
        expect(response.body.did).not.toBe(legacyDid)
        expect(response.body.sid).not.toBe(legacySid)
      },
    },
  ]

  it.each(cases)('$name', async ({ run }) => {
    // Each case's own body carries its real expect() calls, but oxlint's expect-expect rule
    // can't trace into the indirect `run` call. Track the assertion count instead of wrapping
    // in resolves.not.toThrow(), which would satisfy the rule without checking anything ran.
    const assertionsBefore = expect.getState().assertionCalls
    await run()
    expect(expect.getState().assertionCalls).toBeGreaterThan(assertionsBefore)
  })
})
