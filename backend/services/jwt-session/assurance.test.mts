import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import { signSessionJwt, verifyDeviceJwt } from '@ts-shared/session-jwt'
import {
  createTestUserDirect,
  getTestPrivateUserById,
  addTestUserRole,
  insertTestTotpAuthenticator,
} from '@voucha/test-helpers'
import { setTestSessionMfaVerifiedAt } from '@voucha/test-helpers/entities/session-assurance'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createDeviceAndSessionTokens } from './create.mts'
import { verifyDeviceAndSessionTokens } from './verify.mts'
import { readSessionDeviceAuthority } from './device-authority.mts'
import { refreshSessionState } from './flows.mts'
import { markJwtStale } from './invalidation.mts'
import { resolveRequestSessionClaims } from './request-claims.mts'
import { isSessionRevoked } from './revocation.mts'
import { assertOriginalMfaVerifiedAt } from './assurance.mts'
import {
  createAuthenticatedTestSession,
  createVerifiedMfaTestSession,
} from '../../test-helpers/authenticated-session.mts'

const userAgent = 'Mozilla/5.0 (X11; Linux x86_64) Chrome/130.0 Safari/537.36'

describe('original MFA assurance continuity', () => {
  it('rejects a malformed or future-dated original factor timestamp', () => {
    const issuedAt = Math.floor(Date.now() / 1000)
    expect(() => assertOriginalMfaVerifiedAt(issuedAt + 1, issuedAt)).toThrow(
      'Session credentials must be renewed by signing in',
    )
    expect(() => assertOriginalMfaVerifiedAt('unverified', issuedAt)).toThrow(
      'Session credentials must be renewed by signing in',
    )
  })

  it('uses fresh signed claims without a redundant account read', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({ uid: user.id, did: v7() })
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: tokens.deviceToken.token,
      sessionToken: tokens.sessionToken.token,
    })
    if (!verified) throw new Error('Expected the minted session pair')
    const now = Math.floor(Date.now() / 1000)
    const resolved = await resolveRequestSessionClaims(
      { ...verified, sca: now + 30, rca: now + 60 },
      async () => {
        throw new Error('Fresh claims must not fetch the user')
      },
    )
    expect(resolved.session?.uid).toBe(user.id)
    expect(resolved.user).toBeUndefined()
  })

  it('keeps a verified session when only its soft cache expires before the recheck deadline', async () => {
    const user = await createTestUserDirect()
    const tokens = await createDeviceAndSessionTokens({ uid: user.id, did: v7() })
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: tokens.deviceToken.token,
      sessionToken: tokens.sessionToken.token,
    })
    if (!verified) throw new Error('Expected the minted session pair')
    const now = Math.floor(Date.now() / 1000)
    const resolved = await resolveRequestSessionClaims(
      { ...verified, sca: now - 1, rca: now + 60 },
      async () => {
        throw new Error('A live recheck deadline must not fetch the user')
      },
    )
    expect(resolved.session?.uid).toBe(user.id)
    expect(resolved.user).toBeUndefined()
  })

  it('admits an administrator only after the fixture verifies a distinct enrolled TOTP factor', async () => {
    const user = await createTestUserDirect({ withEmail: true })
    await insertTestTotpAuthenticator(user.id, 'role-enrollment')
    await addTestUserRole(user.id, 'administrator')
    const enrolledUser = await getTestPrivateUserById(user.id)
    const raw = await createAuthenticatedTestSession(enrolledUser!)
    expect(raw.sessionToken.payload.mfa_at).toBeUndefined()
    expect(raw.sessionToken.payload.rol).not.toContain('administrator')

    const [first, second] = await Promise.all([
      createVerifiedMfaTestSession(user.id),
      createVerifiedMfaTestSession(user.id),
    ])
    for (const tokens of [first, second]) {
      expect(tokens.sessionToken.payload.mfa_at).toEqual(expect.any(Number))
      expect(tokens.sessionToken.payload.rol).toContain('administrator')
      expect(tokens.deviceToken.payload.mfa_at).toBe(tokens.sessionToken.payload.mfa_at)
    }
  })
  it('authenticates from the current administrator role after a fixture adds it', async () => {
    const user = await createTestUserDirect({ withEmail: true })
    await insertTestTotpAuthenticator(user.id, 'role-admission')
    await addTestUserRole(user.id, 'administrator')
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/admin/oauth-clients').expect(200)
  })
  it('enrolls an administrator role supplied through extraRoles before authentication', async () => {
    const user = await createTestUserDirect({ withEmail: true, extraRoles: ['administrator'] })
    const request = createRequest()
    await request.authenticateAs(user)
    await request.get('/api/v1/admin/oauth-clients').expect(200)
  })
  it('preserves the exact timestamp through encrypted replay, cold enrichment and web rotation', async () => {
    const user = await createTestUserDirect()
    await insertTestTotpAuthenticator(user.id, 'original-proof')
    await addTestUserRole(user.id, 'administrator')
    const verifiedAt = Math.floor(Date.now() / 1000) - 60
    const initial = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      roles: ['administrator'],
      mfaVerifiedAt: verifiedAt,
      deviceContext: { user_agent: userAgent },
    })
    const replay = await createDeviceAndSessionTokens({
      uid: user.id,
      did: initial.deviceToken.payload.did,
      sid: initial.sessionToken.payload.sid,
      roles: ['administrator'],
      mfaVerifiedAt: verifiedAt + 30,
      credentialReplay: true,
      deviceContext: { user_agent: userAgent },
    })
    expect(replay.deviceToken.token).toBe(initial.deviceToken.token)
    expect(replay.sessionToken.payload.mfa_at).toBe(verifiedAt)
    await markJwtStale(user.id)
    const refreshed = await refreshSessionState({
      deviceToken: replay.deviceToken.token,
      sessionToken: replay.sessionToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    expect(refreshed.session).toMatchObject({ mfa_at: verifiedAt, rol: ['administrator'] })
    expect((await verifyDeviceJwt(refreshed.dt))?.mfa_at).toBe(verifiedAt)
    expect(
      (await readSessionDeviceAuthority(initial.sessionToken.payload.sid))?.device_token_binding
        ?.mfa_at,
    ).toBe(verifiedAt)
  })

  it('does not acquire administrator authority from later enrollment or role changes in either request surface', async () => {
    const user = await createTestUserDirect()
    const initial = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      deviceContext: { user_agent: userAgent },
    })
    await insertTestTotpAuthenticator(user.id, 'enrollment-is-not-proof')
    await addTestUserRole(user.id, 'administrator')
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: initial.deviceToken.token,
      sessionToken: initial.sessionToken.token,
    })
    if (!verified) throw new Error('Expected the real minted credential pair')
    const resolved = await resolveRequestSessionClaims(
      { ...verified, sca: 0, rca: 0 },
      getTestPrivateUserById,
    )
    expect(resolved.session?.rol).not.toContain('administrator')
    expect(resolved.user?.roles).not.toContain('administrator')
    const refreshed = await refreshSessionState({
      deviceToken: initial.deviceToken.token,
      userAgent,
      fetchUser: getTestPrivateUserById,
    })
    expect(refreshed.session.mfa_at).toBeUndefined()
    expect(refreshed.session.rol).not.toContain('administrator')
    expect((await verifyDeviceJwt(refreshed.dt))?.mfa_at).toBeUndefined()
  })

  it('rejects a separately signed access token with a different proof than its device token', async () => {
    const user = await createTestUserDirect()
    const verifiedAt = Math.floor(Date.now() / 1000) - 60
    const initial = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      mfaVerifiedAt: verifiedAt,
      deviceContext: { user_agent: userAgent },
    })
    const changed = await signSessionJwt(
      { ...initial.sessionToken.payload, mfa_at: verifiedAt + 1 },
      { expiresIn: '10m' },
    )
    await expect(
      verifyDeviceAndSessionTokens({
        deviceToken: initial.deviceToken.token,
        sessionToken: changed,
      }),
    ).resolves.toBe(false)
  })

  it('rejects original-proof disagreement with the primary authority after a negative cache check', async () => {
    const user = await createTestUserDirect()
    const verifiedAt = Math.floor(Date.now() / 1000) - 60
    const initial = await createDeviceAndSessionTokens({
      uid: user.id,
      did: v7(),
      mfaVerifiedAt: verifiedAt,
      deviceContext: { user_agent: userAgent },
    })
    await setTestSessionMfaVerifiedAt(initial.sessionToken.payload.sid, null)
    await expect(
      isSessionRevoked(initial.sessionToken.payload.sid, {
        userId: user.id,
        deviceId: initial.deviceToken.payload.did,
        mfaVerifiedAt: verifiedAt,
      }),
    ).resolves.toBe(true)
    await expect(
      isSessionRevoked(initial.sessionToken.payload.sid, { userId: user.id }),
    ).resolves.toBe(false)
  })
})
