import { it, expect, describe } from 'vitest'
import {
  createDeviceAndSessionTokens,
  createSessionToken,
  verifyDeviceAndSessionTokens,
} from '../index.mts'
import * as jose from 'jose'
import { v7 } from 'uuid'
import { isUUIDv7 } from '@ts-shared/session-jwt'
import { isSessionRevoked } from '../revocation.mts'
import { legacyUuidV4 } from '../test-helpers/index.mts'

describe('index.creation', () => {
  const DEVICE_TOKEN_EXPIRATION_SECONDS = 2_592_000 // matches jose's "30 days" duration
  const SESSION_TOKEN_EXPIRATION_SECONDS = 2 * 24 * 60 * 60 // matches SESSION_EXPIRATION_STRING
  const ATTESTED_SESSION_TOKEN_EXPIRATION_SECONDS = 30 * 24 * 60 * 60 // matches ATTESTED_SESSION_EXPIRATION_STRING

  it('createDeviceAndSessionTokens creates a valid device token', async () => {
    const did = v7()
    const result = await createDeviceAndSessionTokens({ did })

    expect(result.deviceToken.token).toBeTruthy()
    expect(result.deviceToken.payload.did).toBe(did)

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    expect((verified as Exclude<typeof verified, false>).did).toBe(did)
  })

  it('createDeviceAndSessionTokens rejects invalid device id', async () => {
    await expect(createDeviceAndSessionTokens({ did: 'not-a-uuid' })).rejects.toThrow(
      'Invalid UUIDv7',
    )
  })

  it('createDeviceAndSessionTokens creates a valid session token', async () => {
    const did = v7()
    const result = await createDeviceAndSessionTokens({ did })

    expect(result.sessionToken.token).toBeTruthy()
    expect(result.sessionToken.payload.did).toBe(did)
    expect(result.sessionToken.payload.sid).toBeTruthy()
    expect(result.sessionToken.payload.uid).toBeNull()

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    const v2 = verified as Exclude<typeof verified, false>
    expect(v2.did).toBe(did)
    expect(v2.sid).toBe(result.sessionToken.payload.sid)
    expect(v2.uid).toBeNull()
  })

  it('createDeviceAndSessionTokens sets issuer and expiration claims on both tokens', async () => {
    const did = v7()
    const uid = v7()
    const result = await createDeviceAndSessionTokens({ did, uid })

    const decodedDevice = jose.decodeJwt(result.deviceToken.token)
    const decodedSession = jose.decodeJwt(result.sessionToken.token)

    expect(decodedDevice.iss).toBe('voucha.ai')
    expect(decodedSession.iss).toBe('voucha.ai')
    expect(typeof decodedDevice.iat).toBe('number')
    expect(typeof decodedDevice.exp).toBe('number')
    expect(typeof decodedSession.iat).toBe('number')
    expect(typeof decodedSession.exp).toBe('number')
    const deviceLifetime = (decodedDevice.exp as number) - (decodedDevice.iat as number)
    // Allow ±1s tolerance to avoid flakiness from clock boundaries
    expect(deviceLifetime).toBeGreaterThanOrEqual(DEVICE_TOKEN_EXPIRATION_SECONDS - 1)
    expect(deviceLifetime).toBeLessThanOrEqual(DEVICE_TOKEN_EXPIRATION_SECONDS + 1)
    const sessionLifetime = (decodedSession.exp as number) - (decodedSession.iat as number)
    // Allow ±1s tolerance to avoid flakiness from clock boundaries
    expect(sessionLifetime).toBeGreaterThanOrEqual(SESSION_TOKEN_EXPIRATION_SECONDS - 1)
    expect(sessionLifetime).toBeLessThanOrEqual(SESSION_TOKEN_EXPIRATION_SECONDS + 1)
    expect(decodedDevice.did).toBe(did)
    expect(decodedSession.did).toBe(did)
    expect(decodedSession.sid).toBe(result.sessionToken.payload.sid)
    expect(decodedSession.uid).toBe(uid)
  })

  it('createDeviceAndSessionTokens with uid creates session with user', async () => {
    const did = v7()
    const uid = v7()
    const result = await createDeviceAndSessionTokens({ did, uid })

    expect(result.sessionToken.payload.uid).toBe(uid)

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    expect((verified as Exclude<typeof verified, false>).uid).toBe(uid)
  })

  it('createDeviceAndSessionTokens with custom sid uses provided sid', async () => {
    const did = v7()
    const customSid = v7()
    const result = await createDeviceAndSessionTokens({ did, sid: customSid })

    expect(result.sessionToken.payload.sid).toBe(customSid)
  })

  it('createDeviceAndSessionTokens rotates legacy device and session ids before signing', async () => {
    const legacyDid = legacyUuidV4()
    const legacySid = legacyUuidV4()
    const uid = v7()
    const result = await createDeviceAndSessionTokens({ did: legacyDid, sid: legacySid, uid })

    expect(isUUIDv7(result.deviceToken.payload.did)).toBe(true)
    expect(isUUIDv7(result.sessionToken.payload.did)).toBe(true)
    expect(isUUIDv7(result.sessionToken.payload.sid)).toBe(true)
    expect(result.deviceToken.payload.did).not.toBe(legacyDid)
    expect(result.sessionToken.payload.did).toBe(result.deviceToken.payload.did)
    expect(result.sessionToken.payload.sid).not.toBe(legacySid)

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    expect(verified).toMatchObject({
      did: result.deviceToken.payload.did,
      sid: result.sessionToken.payload.sid,
      uid,
    })
    await expect(isSessionRevoked(legacySid)).resolves.toBe(true)
  })

  it('createSessionToken rotates legacy session ids before signing', async () => {
    const did = v7()
    const legacySid = legacyUuidV4()
    const uid = v7()
    const result = await createSessionToken({ did, sid: legacySid, uid })

    expect(result.payload.did).toBe(did)
    expect(result.payload.uid).toBe(uid)
    expect(isUUIDv7(result.payload.sid)).toBe(true)
    expect(result.payload.sid).not.toBe(legacySid)
    await expect(isSessionRevoked(legacySid)).resolves.toBe(true)

    const decodedSession = jose.decodeJwt(result.token)
    expect(decodedSession.did).toBe(result.payload.did)
    expect(decodedSession.sid).toBe(result.payload.sid)
  })

  it('createDeviceAndSessionTokens rejects invalid session id', async () => {
    const did = v7()
    await expect(createDeviceAndSessionTokens({ did, sid: 'not-a-uuid' })).rejects.toThrow(
      'Invalid UUIDv7',
    )
  })

  it('createDeviceAndSessionTokens rejects invalid user id', async () => {
    const did = v7()
    await expect(createDeviceAndSessionTokens({ did, uid: 'not-a-uuid' })).rejects.toThrow(
      'Invalid UUIDv7',
    )
  })

  it('createDeviceAndSessionTokens creates both device and session tokens', async () => {
    const did = v7()
    const uid = v7()
    const result = await createDeviceAndSessionTokens({ did, uid })

    expect(result.deviceToken.token).toBeTruthy()
    expect(result.deviceToken.payload.did).toBe(did)
    expect(result.sessionToken.token).toBeTruthy()
    expect(result.sessionToken.payload.did).toBe(did)
    expect(result.sessionToken.payload.uid).toBe(uid)

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    const v3 = verified as Exclude<typeof verified, false>
    expect(v3.did).toBe(did)
    expect(v3.uid).toBe(uid)
  })

  it('createDeviceAndSessionTokens with uid includes enrichment fields in session payload', async () => {
    const did = v7()
    const uid = v7()
    const roles = ['administrator']
    const result = await createDeviceAndSessionTokens({
      did,
      uid,
      roles,
      membershipPlan: 'plus',
      trustTier: 3,
    })

    expect(result.sessionToken.payload.rol).toEqual(roles)
    expect(result.sessionToken.payload.mpl).toBe('plus')
    expect(result.sessionToken.payload.tt).toBe(3)
    expect(typeof result.sessionToken.payload.rca).toBe('number')
    expect(typeof result.sessionToken.payload.sca).toBe('number')
  })

  it('createDeviceAndSessionTokens without uid omits enrichment fields', async () => {
    const did = v7()
    const result = await createDeviceAndSessionTokens({ did })

    expect(result.sessionToken.payload.rol).toBeUndefined()
    expect(result.sessionToken.payload.mpl).toBeUndefined()
    expect(result.sessionToken.payload.tt).toBeUndefined()
    expect(result.sessionToken.payload.rca).toBeUndefined()
    expect(result.sessionToken.payload.sca).toBeUndefined()
  })

  it('createDeviceAndSessionTokens without deviceClass omits dc from the device token', async () => {
    const did = v7()
    const result = await createDeviceAndSessionTokens({ did })

    expect(result.deviceToken.payload.dc).toBeUndefined()
    const decodedDevice = jose.decodeJwt(result.deviceToken.token)
    expect(decodedDevice.dc).toBeUndefined()
  })

  it('createDeviceAndSessionTokens with deviceClass:attested bakes dc into dt and extends st to 30 days', async () => {
    const did = v7()
    const result = await createDeviceAndSessionTokens({ did, deviceClass: 'attested' })

    expect(result.deviceToken.payload.dc).toBe('attested')
    const decodedDevice = jose.decodeJwt(result.deviceToken.token)
    expect(decodedDevice.dc).toBe('attested')

    const decodedSession = jose.decodeJwt(result.sessionToken.token)
    const sessionLifetime = (decodedSession.exp as number) - (decodedSession.iat as number)
    expect(sessionLifetime).toBeGreaterThanOrEqual(ATTESTED_SESSION_TOKEN_EXPIRATION_SECONDS - 1)
    expect(sessionLifetime).toBeLessThanOrEqual(ATTESTED_SESSION_TOKEN_EXPIRATION_SECONDS + 1)

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: result.deviceToken.token,
      sessionToken: result.sessionToken.token,
    })
    expect(verified).not.toBe(false)
    expect((verified as Exclude<typeof verified, false>).dc).toBe('attested')
  })
})
