import { revokeUserSessionsBefore } from './session-revocation-keys.mts'
import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  verifyDeviceJwt,
  signDeviceJwt,
  signSessionJwt,
  verifySessionJwt,
  WEB_SESSION_EXPIRATION_SECONDS,
  ATTESTED_SESSION_EXPIRATION_SECONDS,
} from '@ts-shared/session-jwt'
import { createTestUserDirect, getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import {
  createDeviceAndSessionTokens,
  refreshSessionState,
  resetSessionState,
  revokeSession,
  verifyDeviceAndSessionTokens,
} from './index.mts'

const userAgent = 'Synthetic browser/1.0'

describe('web session authority', () => {
  it('uses short web access tokens and refresh-only device claims, while retaining native lifetime', async () => {
    const user = await createTestUserDirect()
    const web = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      roles: ['administrator'],
      deviceContext: { user_agent: userAgent },
    })
    const [device, session] = await Promise.all([
      verifyDeviceJwt(web.deviceToken.token),
      verifySessionJwt(web.sessionToken.token),
    ])
    expect(session!.exp! - session!.iat!).toBe(WEB_SESSION_EXPIRATION_SECONDS)
    expect(device).toMatchObject({
      client: 'web',
      refresh_uid: user.id,
      refresh_sid: session!.sid,
      ua_hash: session!.ua_hash,
    })
    expect(device).not.toHaveProperty('rol')
    const native = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceClass: 'attested',
    })
    const nativeSession = await verifySessionJwt(native.sessionToken.token)
    expect(nativeSession!.exp! - nativeSession!.iat!).toBe(ATTESTED_SESSION_EXPIRATION_SECONDS)
    expect(nativeSession?.client).toBe('native')
    expect(await verifyDeviceJwt(native.deviceToken.token)).toMatchObject({
      refresh_uid: user.id,
      dc: 'attested',
    })
  })

  it('refreshes through the device credential after the access cookie is gone, with current user claims', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      roles: ['administrator'],
      deviceContext: { user_agent: userAgent },
    })
    const refreshed = await refreshSessionState({
      deviceToken: tokens.deviceToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    expect(refreshed.uid).toBe(user.id)
    expect(refreshed.sid).toBe(tokens.sessionToken.payload.sid)
    expect(refreshed.session).toMatchObject({
      client: 'web',
      ua_hash: tokens.sessionToken.payload.ua_hash,
    })
    expect(refreshed.session.rol).not.toContain('administrator')
    const access = await verifySessionJwt(refreshed.st)
    expect(access!.exp! - access!.iat!).toBe(WEB_SESSION_EXPIRATION_SECONDS)
    await expect(
      refreshSessionState({
        deviceToken: tokens.deviceToken.token,
        sessionToken: tokens.sessionToken.token,
        userAgent: 'Another client',
        fetchUser: getTestPrivateUserById,
      }),
    ).rejects.toMatchObject({ status: 401, code: 'SESSION_USER_AGENT_MISMATCH' })
    await expect(
      refreshSessionState({
        deviceToken: tokens.deviceToken.token,
        userAgent: 'Another client',
        fetchUser: getTestPrivateUserById,
      }),
    ).rejects.toMatchObject({ status: 401, code: 'SESSION_USER_AGENT_MISMATCH' })
  })

  it('does not classify an unmarked authenticated token as a native session', async () => {
    const user = await createTestUserDirect()
    const did = v7()
    const deviceToken = await signDeviceJwt({ did }, { expiresIn: '30 days' })
    const sessionToken = await signSessionJwt(
      { did, sid: v7(), uid: user.id },
      { expiresIn: '2 days' },
    )
    await expect(verifyDeviceAndSessionTokens({ deviceToken, sessionToken })).resolves.toBe(false)
    const refreshed = await refreshSessionState({
      deviceToken,
      sessionToken,
      fetchUser: getTestPrivateUserById,
    })
    expect(refreshed.uid).toBeNull()
  })

  it('checks revocation before device refresh and removes its authority from anonymous replacement tokens', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceContext: { user_agent: userAgent },
    })
    await revokeSession(tokens.sessionToken.payload.sid)
    const refreshed = await refreshSessionState({
      deviceToken: tokens.deviceToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    expect(refreshed.uid).toBeNull()
    expect(await verifyDeviceJwt(refreshed.dt)).not.toHaveProperty('refresh_uid')
  })

  it('keeps the original device epoch authoritative after access token rotation', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceContext: { user_agent: userAgent },
    })
    const device = (await verifyDeviceJwt(tokens.deviceToken.token))!
    await revokeUserSessionsBefore(user.id, device.iat!)
    const newerAccess = await signSessionJwt(tokens.sessionToken.payload, {
      expiresIn: '10 minutes',
      issuedAt: device.iat! + 1,
    })
    const refreshed = await refreshSessionState({
      deviceToken: tokens.deviceToken.token,
      sessionToken: newerAccess,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    expect(refreshed.uid).toBeNull()
  })

  it('revokes refresh authority when logging out after the access cookie expires', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceContext: { user_agent: userAgent },
    })
    const reset = await resetSessionState({ deviceToken: tokens.deviceToken.token })
    expect(reset.uid).toBeNull()
    expect(await verifyDeviceJwt(reset.dt)).not.toHaveProperty('refresh_uid')
    const replay = await refreshSessionState({
      deviceToken: tokens.deviceToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    expect(replay.uid).toBeNull()
  })
})
