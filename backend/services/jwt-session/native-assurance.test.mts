import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'
import {
  createTestUserDirect,
  getTestPrivateUserById,
  addTestUserRole,
  insertTestTotpAuthenticator,
} from '@voucha/test-helpers'
import { createDeviceAndSessionTokens } from './create.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'
import { upgradeVerifiedNativeSession } from './native-upgrade.mts'
import { refreshSessionState } from './flows.mts'
import { revokeAuthenticatedSession } from './user-session-revocation.mts'
import { rotateAuthenticatedDeviceToken } from './device-authority-rotation.mts'
import { listActiveUserSessions } from './list-active-user-sessions.mts'

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36'

describe('original MFA across verified native authority changes', () => {
  it('rejects a mismatched identity and a consumed web device credential during upgrade', async () => {
    const user = await createTestUserDirect()
    const original = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const upgrade = (did: string) =>
      upgradeVerifiedNativeSession({
        deviceToken: original.deviceToken.token,
        uid: user.id,
        did,
        sid: original.sessionToken.payload.sid,
        fetchUser: (uid, query) => getTestPrivateUserById(uid, { query }),
      })

    await expect(upgrade(v7())).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    await refreshSessionState({
      deviceToken: original.deviceToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    await expect(upgrade(original.deviceToken.payload.did)).rejects.toMatchObject({
      code: 'SESSION_RELOGIN_REQUIRED',
    })
  })

  it.each(['logout', 'rotation'] as const)(
    'rejects an upgrade when %s consumes its source after authority validation',
    async operation => {
      const user = await createTestUserDirect()
      const original = await createDeviceAndSessionTokens({
        uid: user.id,
        did: v7(),
        deviceContext: { user_agent: userAgent },
      })
      const sid = original.sessionToken.payload.sid

      await expect(
        upgradeVerifiedNativeSession({
          deviceToken: original.deviceToken.token,
          uid: user.id,
          did: original.deviceToken.payload.did,
          sid,
          fetchUser: async (uid, query) => {
            if (operation === 'logout') {
              await revokeAuthenticatedSession(user.id, sid)
            } else {
              await rotateAuthenticatedDeviceToken({
                deviceToken: original.deviceToken.token,
                uid: user.id,
                did: original.deviceToken.payload.did,
                sid,
              })
            }
            return getTestPrivateUserById(uid, { query })
          },
        }),
      ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
      const active = await listActiveUserSessions(user.id, sid)
      expect(active.results.map(session => session.id)).toEqual(operation === 'logout' ? [] : [sid])
    },
  )

  it.each([false, true])(
    'preserves original proof, without creating it, during upgrade and renewal (proof=%s)',
    async proof => {
      const user = await createTestUserDirect()
      await insertTestTotpAuthenticator(user.id, 'hardware-is-not-MFA')
      await addTestUserRole(user.id, 'administrator')
      const verifiedAt = proof ? Math.floor(Date.now() / 1000) - 60 : undefined
      const original = await createDeviceAndSessionTokens({
        uid: user.id,
        did: v7(),
        roles: ['administrator'],
        mfaVerifiedAt: verifiedAt,
        deviceContext: { user_agent: userAgent },
      })
      const upgraded = await upgradeVerifiedNativeSession({
        deviceToken: original.deviceToken.token,
        uid: user.id,
        did: original.deviceToken.payload.did,
        sid: original.sessionToken.payload.sid,
        fetchUser: (uid, query) => getTestPrivateUserById(uid, { query }),
      })
      expect(upgraded.sessionToken.payload.sid).not.toBe(original.sessionToken.payload.sid)
      expect(upgraded.deviceToken.payload.mfa_at).toBe(verifiedAt)
      expect(upgraded.sessionToken.payload.mfa_at).toBe(verifiedAt)
      expect(upgraded.sessionToken.payload.rol?.includes('administrator')).toBe(proof)
      const renewed = await createDeviceAndSessionTokens({
        uid: user.id,
        did: upgraded.deviceToken.payload.did,
        sid: upgraded.sessionToken.payload.sid,
        roles: ['administrator'],
        mfaVerifiedAt: Math.floor(Date.now() / 1000),
        deviceClass: 'attested',
        deviceRenewal: 'verified-native-attestation',
      })
      expect((await verifyDeviceJwt(renewed.deviceToken.token))?.mfa_at).toBe(verifiedAt)
      expect(renewed.sessionToken.payload.mfa_at).toBe(verifiedAt)
      expect(renewed.sessionToken.payload.rol?.includes('administrator')).toBe(proof)
      expect(
        (await readSessionDeviceAuthority(renewed.sessionToken.payload.sid))?.device_token_binding
          ?.mfa_at,
      ).toBe(verifiedAt)
    },
  )

  it('never gives an anonymous attested device a completed-factor proof', async () => {
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      deviceClass: 'attested',
      mfaVerifiedAt: Math.floor(Date.now() / 1000),
    })
    expect(tokens.deviceToken.payload.mfa_at).toBeUndefined()
    expect(tokens.sessionToken.payload.mfa_at).toBeUndefined()
    expect(tokens.sessionToken.payload.uid).toBeNull()
  })
})
