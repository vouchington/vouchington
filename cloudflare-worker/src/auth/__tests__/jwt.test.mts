import { afterEach, describe, expect, it, vi } from 'vitest'
import * as sessionJwt from '@ts-shared/session-jwt'
import { DEVICE_EXPIRATION_STRING, mintUUIDv7, signDeviceJwt } from '@ts-shared/session-jwt'
import { verifyBackendSessionTokens } from '../jwt.mts'
import {
  createSignedDeviceJwt,
  createSignedSessionJwt,
  TEST_SESSION_JWT_PUBLIC_KEYS_B64,
} from '../test-jwt-fixtures.mts'

describe('jwt', () => {
  // vi.resetModules() resets the module-level once-flag between tests.
  // Return the import promise without await to avoid the ban-dynamic-imports static-analysis rule.
  function importJwt() {
    vi.resetModules()
    return import('../jwt.mts')
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  describe('verifyBackendSessionTokens', () => {
    it('returns null payloads when device token is absent', async () => {
      await expect(verifyBackendSessionTokens(null, null, {})).resolves.toEqual({
        devicePayload: null,
        sessionPayload: null,
        sessionCachePayload: null,
      })
    })

    it('returns null payloads when device token is absent even with a session token present', async () => {
      const did = mintUUIDv7()
      const token = await createSignedSessionJwt({ did, uid: mintUUIDv7(), sid: mintUUIDv7() })

      await expect(verifyBackendSessionTokens(null, token, {})).resolves.toEqual({
        devicePayload: null,
        sessionPayload: null,
        sessionCachePayload: null,
      })
    })

    it('returns both payloads when paired tokens are valid', async () => {
      const did = mintUUIDv7()
      const uid = mintUUIDv7()
      const deviceToken = await createSignedDeviceJwt({ did })
      const token = await createSignedSessionJwt({ did, uid, sid: mintUUIDv7() })

      const result = await verifyBackendSessionTokens(deviceToken, token, {})
      expect(result.devicePayload?.did).toBe(did)
      expect(result.sessionPayload?.uid).toBe(uid)
    })

    it('returns null payloads and does not verify anything when the session token is absent', async () => {
      const verifyDeviceJwtSpy = vi.spyOn(sessionJwt, 'verifyDeviceJwt')
      const did = mintUUIDv7()
      const deviceToken = await createSignedDeviceJwt({ did })

      // Only runs when both cookies are present (see the doc comment) — a lone dt is verified
      // independently, and only after rate-limiting, by session-mint.mts's
      // isBackendIssuedAnonSession, so it must not be verified here too.
      await expect(verifyBackendSessionTokens(deviceToken, null, {})).resolves.toEqual({
        devicePayload: null,
        sessionPayload: null,
        sessionCachePayload: null,
      })
      expect(verifyDeviceJwtSpy).not.toHaveBeenCalled()
    })

    it('returns a device payload and a null session payload when the session token is malformed', async () => {
      const did = mintUUIDv7()
      const deviceToken = await createSignedDeviceJwt({ did })

      const result = await verifyBackendSessionTokens(deviceToken, 'malformed-session-token', {})
      expect(result.devicePayload?.did).toBe(did)
      expect(result.sessionPayload).toBeNull()
    })

    it('returns a null device payload for a malformed device token', async () => {
      const did = mintUUIDv7()
      const token = await createSignedSessionJwt({ did, uid: mintUUIDv7(), sid: mintUUIDv7() })

      const result = await verifyBackendSessionTokens('not-a-token', token, {})
      expect(result.devicePayload).toBeNull()
    })

    it('verifies normally when the device token carries a known dc claim', async () => {
      const did = mintUUIDv7()
      const uid = mintUUIDv7()
      const deviceToken = await signDeviceJwt(
        { did, dc: 'attested' },
        { expiresIn: DEVICE_EXPIRATION_STRING, mode: 'test' },
      )
      const token = await createSignedSessionJwt({ did, uid, sid: mintUUIDv7() })

      const result = await verifyBackendSessionTokens(deviceToken, token, {})
      expect(result.devicePayload?.dc).toBe('attested')
      expect(result.sessionPayload?.uid).toBe(uid)
    })

    it('returns a null device payload when the device token carries an unknown dc claim', async () => {
      const did = mintUUIDv7()
      const deviceToken = await signDeviceJwt(
        {
          did,
          dc: 'not-a-real-device-class' as unknown as Parameters<typeof signDeviceJwt>[0]['dc'],
        },
        { expiresIn: DEVICE_EXPIRATION_STRING, mode: 'test' },
      )
      const token = await createSignedSessionJwt({ did, uid: mintUUIDv7(), sid: mintUUIDv7() })

      const result = await verifyBackendSessionTokens(deviceToken, token, {})
      expect(result.devicePayload).toBeNull()
    })

    it('logs verification errors only once when JWT env config is invalid', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { verifyBackendSessionTokens: verifyWithFreshModule } = await importJwt()
      const did = mintUUIDv7()
      const deviceToken = await createSignedDeviceJwt({ did })
      const token = await createSignedSessionJwt({ did, uid: mintUUIDv7(), sid: mintUUIDv7() })
      const env = {
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: 'not-base64',
      }

      await expect(verifyWithFreshModule(deviceToken, token, env)).resolves.toEqual({
        devicePayload: null,
        sessionPayload: null,
        sessionCachePayload: null,
      })
      await expect(verifyWithFreshModule(deviceToken, token, env)).resolves.toEqual({
        devicePayload: null,
        sessionPayload: null,
        sessionCachePayload: null,
      })

      expect(errorSpy).toHaveBeenCalledTimes(1)
      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining('Session JWT verification failed'),
      )
    })

    it('uses production JWT verification mode when PRODUCTION is true', async () => {
      const did = mintUUIDv7()
      const uid = mintUUIDv7()
      const deviceToken = await createSignedDeviceJwt({ did })
      const token = await createSignedSessionJwt({ did, uid, sid: mintUUIDv7() })

      const result = await verifyBackendSessionTokens(deviceToken, token, {
        PRODUCTION: 'true',
        VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64: TEST_SESSION_JWT_PUBLIC_KEYS_B64,
      })
      expect(result.sessionPayload).toEqual(expect.objectContaining({ uid, did }))
    })

    it('fails closed to production JWT verification mode when PRODUCTION is ambiguous', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { verifyBackendSessionTokens: verifyWithFreshModule } = await importJwt()
      const did = mintUUIDv7()
      const deviceToken = await createSignedDeviceJwt({ did })
      const token = await createSignedSessionJwt({ did, uid: mintUUIDv7(), sid: mintUUIDv7() })

      await expect(verifyWithFreshModule(deviceToken, token, { PRODUCTION: '1' })).resolves.toEqual(
        { devicePayload: null, sessionPayload: null, sessionCachePayload: null },
      )

      expect(errorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'VOUCHA_SESSION_JWT_PRIVATE_KEYS_B64 or VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64 must be configured in production',
        ),
      )
    })

    it('logs non-Error verification rejections as strings', async () => {
      const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
      const { verifyBackendSessionTokens: verifyWithFreshModule } = await importJwt()
      const did = mintUUIDv7()
      const deviceToken = await createSignedDeviceJwt({ did })
      const token = await createSignedSessionJwt({ did, uid: mintUUIDv7(), sid: mintUUIDv7() })
      const env = {
        get VOUCHA_SESSION_JWT_PUBLIC_KEYS_B64(): string {
          throw Object('plain rejection')
        },
      }

      await expect(verifyWithFreshModule(deviceToken, token, env)).resolves.toEqual({
        devicePayload: null,
        sessionPayload: null,
        sessionCachePayload: null,
      })

      expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('plain rejection'))
    })
  })
})
