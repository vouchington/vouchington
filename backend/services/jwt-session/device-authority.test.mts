import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { verifyDeviceJwt, signSessionJwt } from '@ts-shared/session-jwt'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { createTestUserDirect, getTestPrivateUserById } from '@voucha/test-helpers/entities/users'
import { mintAuthenticatedDeviceAuthority } from './device-authority-mint.mts'
import { createDeviceAndSessionTokens, createSessionToken } from './create.mts'
import { refreshSessionState } from './flows.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'
import { rotateAuthenticatedDeviceToken } from './device-authority-rotation.mts'
import { getJwtRevokedKey, getJwtUserRevokedBeforeKey } from './constants.mts'
import { isSessionRevoked, revokeSession } from './revocation.mts'

const userAgent = 'Mozilla/5.0 (Windows NT 10.0) Chrome/130.0 Safari/537.36'

describe('durable device credential authority', () => {
  it('rejects a rotation requested for a different principal without changing authority', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    const before = await readSessionDeviceAuthority(sid)
    await expect(
      rotateAuthenticatedDeviceToken({
        deviceToken: tokens.deviceToken.token,
        uid: v7(),
        did: tokens.deviceToken.payload.did,
        sid,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    expect(await readSessionDeviceAuthority(sid)).toEqual(before)
  })

  it('rejects credential replay after a user-wide cutoff without a SID marker', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    const binding = (await readSessionDeviceAuthority(sid))!.device_token_binding!
    const cutoffKey = getJwtUserRevokedBeforeKey(user.id)
    await sessionValkeyClient.set(cutoffKey, String(Math.floor(Date.now() / 1000) + 60))
    try {
      await expect(
        mintAuthenticatedDeviceAuthority({
          uid: user.id,
          did: tokens.deviceToken.payload.did,
          sid,
          binding,
          issuedAt: tokens.deviceToken.payload.iat!,
          credentialReplay: true,
          deviceContext: { user_agent: userAgent },
        }),
      ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
      await expect(sessionValkeyClient.get(getJwtRevokedKey(sid))).resolves.toBeNull()
    } finally {
      await sessionValkeyClient.del([cutoffKey])
    }
  })

  it.each([
    { description: 'an unexpected binding field', change: { unexpected: true } },
    { description: 'an invalid browser-agent hash', change: { ua_hash: 'invalid' } },
  ])('rejects $description in durable authority', async ({ change }) => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = tokens.sessionToken.payload.sid
    const row = await readSessionDeviceAuthority(sid)
    const binding = JSON.stringify({ ...row!.device_token_binding, ...change })
    await write(sql`/* corruptTestDeviceBinding */
      UPDATE user_sessions SET device_token_binding = ${binding}::jsonb
      WHERE id = ${sid} AND user_id = ${user.id}`)

    await expect(readSessionDeviceAuthority(sid)).rejects.toMatchObject({
      code: 'SESSION_RELOGIN_REQUIRED',
    })
  })

  it.each(['missing', 'expired'] as const)(
    'requires login recovery for %s native access without changing device authority',
    async accessState => {
      const user = await createTestUserDirect()
      const tokens = await createDeviceAndSessionTokens({
        uid: user.id,
        did: v7(),
        deviceClass: 'attested',
      })
      const sid = tokens.sessionToken.payload.sid
      const before = await readSessionDeviceAuthority(sid)
      const sessionToken =
        accessState === 'expired'
          ? await signSessionJwt(tokens.sessionToken.payload, { expiresIn: -1 })
          : undefined
      await expect(
        refreshSessionState({
          deviceToken: tokens.deviceToken.token,
          sessionToken,
          fetchUser: getTestPrivateUserById,
        }),
      ).rejects.toMatchObject({ status: 401, code: 'AUTH_REQUIRED' })
      expect(await readSessionDeviceAuthority(sid)).toEqual(before)
    },
  )

  it('rotates once while preserving the original epoch, expiry and trusted browser signals', async () => {
    const user = await createTestUserDirect()
    const initial = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent, ja4: 'original-ja4' },
    })
    const before = await verifyDeviceJwt(initial.deviceToken.token)
    const refreshed = await refreshSessionState({
      deviceToken: initial.deviceToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    const after = await verifyDeviceJwt(refreshed.dt)
    expect(refreshed.dt).not.toBe(initial.deviceToken.token)
    expect(after).toMatchObject({
      iat: before!.iat,
      exp: before!.exp,
      ua_hash: before!.ua_hash,
      ja4_hash: before!.ja4_hash,
    })
    expect(after!.jti).not.toBe(before!.jti)
    const row = await readSessionDeviceAuthority(refreshed.sid)
    expect(row!.device_token_encrypted).not.toBe(refreshed.dt)
    expect(row!.device_token_digest).not.toBe(refreshed.dt)
    const replay = await createDeviceAndSessionTokens({
      uid: user.id,
      did: refreshed.did,
      sid: refreshed.sid,
      credentialReplay: true,
      deviceContext: { user_agent: userAgent },
    })
    expect(replay.deviceToken.token).toBe(refreshed.dt)
    await expect(
      refreshSessionState({
        deviceToken: refreshed.dt,
        userAgent,
        ja4: 'changed-ja4',
        fetchUser: getTestPrivateUserById,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_JA4_MISMATCH' })
  })

  it('revokes the session on concurrent reuse and retains revocation without its cache marker', async () => {
    const user = await createTestUserDirect()
    const initial = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const renew = () =>
      refreshSessionState({
        deviceToken: initial.deviceToken.token,
        userAgent,
        fetchUser: getTestPrivateUserById,
      })
    const outcomes = await Promise.allSettled([renew(), renew()])
    expect(outcomes.filter(outcome => outcome.status === 'fulfilled')).toHaveLength(1)
    const rejected = outcomes.find(
      outcome => outcome.status === 'rejected',
    ) as PromiseRejectedResult
    expect(rejected.reason).toMatchObject({ code: 'SESSION_REFRESH_REUSED' })
    const sid = initial.sessionToken.payload.sid
    expect((await readSessionDeviceAuthority(sid))!.revoked_at).toBeInstanceOf(Date)
    await sessionValkeyClient.del([getJwtRevokedKey(sid)])
    await expect(
      isSessionRevoked(sid, { userId: user.id, deviceId: initial.deviceToken.payload.did }),
    ).resolves.toBe(true)
    await expect(
      createDeviceAndSessionTokens({
        uid: user.id,
        did: initial.deviceToken.payload.did,
        sid,
        credentialReplay: true,
        deviceContext: { user_agent: userAgent },
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
  })

  it('renews a verified native device from durable authority without an ephemeral authority record', async () => {
    const user = await createTestUserDirect()
    const did = v7()
    const sid = v7()
    const issuedAt = Math.floor(Date.now() / 1000)
    const initial = await mintAuthenticatedDeviceAuthority({
      uid: user.id,
      did,
      sid,
      binding: { client: 'native' },
      deviceClass: 'attested',
      issuedAt: issuedAt - 24 * 60 * 60,
    })
    const previousAccess = await createSessionToken({
      uid: user.id,
      did,
      sid,
      clientBinding: { client: 'native' },
      deviceClass: 'attested',
    })
    const beforeInvalidRenewal = await readSessionDeviceAuthority(sid)
    await expect(
      mintAuthenticatedDeviceAuthority({
        uid: user.id,
        did,
        sid,
        binding: { client: 'native' },
        issuedAt,
        deviceRenewal: 'verified-native-attestation',
      }),
    ).rejects.toMatchObject({ code: 'SESSION_RELOGIN_REQUIRED' })
    expect(await readSessionDeviceAuthority(sid)).toEqual(beforeInvalidRenewal)
    const renewed = await mintAuthenticatedDeviceAuthority({
      uid: user.id,
      did,
      sid,
      binding: { client: 'native' },
      deviceClass: 'attested',
      issuedAt,
      deviceRenewal: 'verified-native-attestation',
    })
    expect(renewed.token).not.toBe(initial.token)
    expect(renewed.payload).toMatchObject({
      client: 'native',
      dc: 'attested',
      refresh_uid: user.id,
      refresh_sid: sid,
      iat: issuedAt,
    })
    expect(renewed.payload.exp).toBeGreaterThan(initial.payload.exp!)
    const row = await readSessionDeviceAuthority(sid)
    expect(row!.device_token_issued_at!.getTime()).toBe(issuedAt * 1000)
    expect(row!.expires_at.getTime()).toBe(renewed.payload.exp! * 1000)
    await expect(
      refreshSessionState({
        deviceToken: initial.token,
        sessionToken: previousAccess.token,
        fetchUser: getTestPrivateUserById,
      }),
    ).rejects.toMatchObject({ code: 'SESSION_REFRESH_REUSED' })
  })

  it('checks durable revocation and rejects missing registry rows after a cache miss', async () => {
    const user = await createTestUserDirect()
    const initial = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    const sid = initial.sessionToken.payload.sid
    await revokeSession(sid)
    await sessionValkeyClient.del([getJwtRevokedKey(sid)])
    await expect(isSessionRevoked(sid, { userId: user.id })).resolves.toBe(true)
    await expect(isSessionRevoked(v7(), { userId: user.id })).resolves.toBe(true)
    const refreshed = await refreshSessionState({
      deviceToken: initial.deviceToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    expect(refreshed.uid).toBeNull()
  })
})
