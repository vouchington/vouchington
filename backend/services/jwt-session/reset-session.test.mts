import { describe, expect, it } from 'vitest'
import { resetSessionState } from './reset-session.mts'
import {
  expectUuidV7,
  legacyUuidV4,
  signLegacyDeviceJwt,
} from '../../test-helpers/services/jwt-session/index.mts'

describe('resetSessionState', () => {
  it('mints a UUIDv7 device id when no device token is present', async () => {
    const result = await resetSessionState({})

    expectUuidV7(result.did)
    expectUuidV7(result.sid)
    expect(result.uid).toBeNull()
    expect(result.dt).toBeTruthy()
    expect(result.st).toBeTruthy()
  })

  it('mints a UUIDv7 device id when the device token is invalid', async () => {
    const result = await resetSessionState({ deviceToken: 'not-a-jwt' })

    expectUuidV7(result.did)
    expectUuidV7(result.sid)
    expect(result.uid).toBeNull()
  })

  it('rotates a valid legacy device token on reset', async () => {
    const legacyDid = legacyUuidV4()
    const deviceToken = await signLegacyDeviceJwt({ did: legacyDid, dc: 'attested' })

    const result = await resetSessionState({ deviceToken })

    expectUuidV7(result.did)
    expectUuidV7(result.sid)
    expect(result.did).not.toBe(legacyDid)
    expect(result.dt).not.toBe(deviceToken)
    expect(result.uid).toBeNull()
    expect(result.deviceClass).toBeUndefined()
  })
})
