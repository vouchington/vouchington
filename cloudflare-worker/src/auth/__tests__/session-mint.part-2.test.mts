import { describe, expect, it } from 'vitest'
import {
  mintUUIDv7,
  type DeviceTokenPayload,
  type SessionTokenPayload,
} from '@ts-shared/session-jwt'
import { createSignedDeviceJwt } from '../test-jwt-fixtures.mts'
import type { Env } from '../../types.mts'
import { isBackendIssuedAnonSession } from '../session-mint.mts'

const BASE_ENV: Env = {
  VOUCHA_EDGE_ANON_SESSION_JWT_PRIVATE_KEYS_B64: 'some-key-b64',
  VOUCHA_EDGE_ANON_SESSION_JWT_PUBLIC_KEYS_B64: 'some-public-key-b64',
}

describe('isBackendIssuedAnonSession', () => {
  it('returns false when deviceToken is absent', async () => {
    const sessionPayload: SessionTokenPayload = { did: mintUUIDv7(), uid: null, sid: mintUUIDv7() }
    await expect(
      isBackendIssuedAnonSession(null, 'irrelevant-st', null, sessionPayload, BASE_ENV),
    ).resolves.toBe(false)
  })

  // sessionToken present: reuses the already-verified payloads (see jwt.mts's
  // verifyBackendSessionTokens) instead of re-verifying — the bogus token strings below would
  // fail real verification, so a passing test here proves no re-verify happens.
  it('reuses already-verified payloads and returns true when sessionPayload is null (st present but unusable)', async () => {
    const devicePayload: DeviceTokenPayload = { did: mintUUIDv7() }
    await expect(
      isBackendIssuedAnonSession('irrelevant-dt', 'irrelevant-st', devicePayload, null, BASE_ENV),
    ).resolves.toBe(true)
  })

  it('reuses already-verified payloads and returns true when did matches and uid is null', async () => {
    const did = mintUUIDv7()
    const devicePayload: DeviceTokenPayload = { did }
    const sessionPayload: SessionTokenPayload = { did, uid: null, sid: mintUUIDv7() }
    await expect(
      isBackendIssuedAnonSession(
        'irrelevant-dt',
        'irrelevant-st',
        devicePayload,
        sessionPayload,
        BASE_ENV,
      ),
    ).resolves.toBe(true)
  })

  it('reuses already-verified payloads and returns false when did does not match', async () => {
    const devicePayload: DeviceTokenPayload = { did: mintUUIDv7() }
    const sessionPayload: SessionTokenPayload = { did: mintUUIDv7(), uid: null, sid: mintUUIDv7() }
    await expect(
      isBackendIssuedAnonSession(
        'irrelevant-dt',
        'irrelevant-st',
        devicePayload,
        sessionPayload,
        BASE_ENV,
      ),
    ).resolves.toBe(false)
  })

  it('reuses already-verified payloads and returns false when uid is non-null (authenticated session)', async () => {
    const did = mintUUIDv7()
    const devicePayload: DeviceTokenPayload = { did }
    const sessionPayload: SessionTokenPayload = { did, uid: mintUUIDv7(), sid: mintUUIDv7() }
    await expect(
      isBackendIssuedAnonSession(
        'irrelevant-dt',
        'irrelevant-st',
        devicePayload,
        sessionPayload,
        BASE_ENV,
      ),
    ).resolves.toBe(false)
  })

  it('returns false when devicePayload is null even with sessionToken present', async () => {
    const sessionPayload: SessionTokenPayload = { did: mintUUIDv7(), uid: null, sid: mintUUIDv7() }
    await expect(
      isBackendIssuedAnonSession('irrelevant-dt', 'irrelevant-st', null, sessionPayload, BASE_ENV),
    ).resolves.toBe(false)
  })

  // sessionToken absent: verifyBackendSessionTokens only verifies when both cookies are present,
  // so a lone dt arrives here unverified and must be checked independently.
  it('independently verifies a lone dt when sessionToken is absent', async () => {
    const did = mintUUIDv7()
    const deviceToken = await createSignedDeviceJwt({ did })
    await expect(isBackendIssuedAnonSession(deviceToken, null, null, null, BASE_ENV)).resolves.toBe(
      true,
    )
  })

  it('returns false when the independently-verified lone dt fails verification', async () => {
    await expect(
      isBackendIssuedAnonSession('not-a-real-token', null, null, null, BASE_ENV),
    ).resolves.toBe(false)
  })
})
