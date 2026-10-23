import {
  createRequestContext,
  getOnlyCookieWrite,
  verifyOnlyCookiePair,
} from '@voucha/test-helpers/request-session-context'
import { describe, expect, it } from 'vitest'
import type { Context } from '@jongleberry/api-server'
import {
  createDeviceAndSessionTokens,
  verifyDeviceAndSessionTokens,
  markJwtStale,
} from '@services/jwt-session'
import { revokeSession } from '@services/jwt-session/revocation'
import {
  expectUuidV7,
  legacyUuidV4,
  signLegacyDeviceJwt,
  signLegacySessionJwt,
} from '@voucha/test-helpers/services/jwt-session/index'
import { cacheBootstrapDeviceId } from '@modules/request-client-info'
import { ATTESTED_SESSION_EXPIRATION_SECONDS, signSessionJwt } from '@ts-shared/session-jwt'
import { sessionValkeyClient } from '@data-stores/valkey/clients'
import { getJwtStaleKey } from '@data-stores/valkey/jwt-stale'

import {
  createTestMembership,
  createTestUser,
  softDeleteUser,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'

describe('server request context', () => {
  it('resolves and memoizes an existing user without writing cookies', async () => {
    const user = await createRequiredTestUser()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), uid: user.id })
    const { context, cookieWrites } = createRequestContext({
      dt: tokens.deviceToken.token,
      st: tokens.sessionToken.token,
    })

    const [first, second] = await Promise.all([context.getCurrentUser(), context.getCurrentUser()])

    expect(first).toBe(second)
    expect(first?.id).toBe(user.id)
    expect(cookieWrites).toEqual([])
  })

  it('clears mismatched browser credentials and memoizes an anonymous result', async () => {
    const user = await createRequiredTestUser()
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceContext: { user_agent: 'Original browser' },
    })
    const { context, cookieWrites } = createRequestContext(
      { dt: tokens.deviceToken.token, st: tokens.sessionToken.token },
      { headers: { 'user-agent': 'Changed browser' } } as Context['req'],
    )
    const [first, second] = await Promise.all([
      context.getSessionTokenData(),
      context.getSessionTokenData(),
    ])
    expect(first).toBe(second)
    expect(first.uid).toBeNull()
    await expect(context.getCurrentUser()).resolves.toBeNull()
    expect(cookieWrites).toHaveLength(2)
    expect(cookieWrites.every(cookie => cookie.value === '' && cookie.options?.maxAge === 0)).toBe(
      true,
    )
  })

  it('re-mints anonymous tokens when a session user has been soft-deleted', async () => {
    const user = await createRequiredTestUser()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), uid: user.id })
    await softDeleteUser(user.id)
    const { context, cookieWrites } = createRequestContext({
      dt: tokens.deviceToken.token,
      st: tokens.sessionToken.token,
    })

    await expect(context.getCurrentUser()).resolves.toBeNull()

    const replacement = await verifyOnlyCookiePair(cookieWrites)
    expect(replacement.uid).toBeNull()
    expect(replacement.did).toBe(tokens.deviceToken.payload.did)
    expect(replacement.sid).not.toBe(tokens.sessionToken.payload.sid)
  })

  it('rejects signed UUIDv4 identifiers without trusting or rewriting their cookies', async () => {
    const user = await createRequiredTestUser()
    const legacyDid = legacyUuidV4()
    const legacySid = legacyUuidV4()
    const [deviceToken, sessionToken] = await Promise.all([
      signLegacyDeviceJwt({ did: legacyDid }),
      signLegacySessionJwt({ did: legacyDid, sid: legacySid, uid: user.id }),
    ])
    const { context, cookieWrites } = createRequestContext({ dt: deviceToken, st: sessionToken })

    await expect(context.getCurrentUser()).resolves.toBeNull()
    expect(cookieWrites).toEqual([])
  })

  it('preserves an attested device class and session cookie lifetime when re-minting', async () => {
    const user = await createRequiredTestUser()
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      deviceClass: 'attested',
    })
    await softDeleteUser(user.id)
    const { context, cookieWrites } = createRequestContext({
      dt: tokens.deviceToken.token,
      st: tokens.sessionToken.token,
    })

    await expect(context.getCurrentUser()).resolves.toBeNull()

    const replacement = await verifyOnlyCookiePair(cookieWrites)
    expect(replacement.dc).toBe('attested')
    expect(getOnlyCookieWrite(cookieWrites, 'st').options?.maxAge).toBe(
      ATTESTED_SESSION_EXPIRATION_SECONDS,
    )
  })

  it('returns no user and writes no cookies for an anonymous session', async () => {
    const tokens = await createDeviceAndSessionTokens({ did: v7() })
    const { context, cookieWrites } = createRequestContext({
      dt: tokens.deviceToken.token,
      st: tokens.sessionToken.token,
    })

    await expect(context.getCurrentUser()).resolves.toBeNull()
    expect(cookieWrites).toEqual([])
  })

  it('downgrades and memoizes a revoked session with one replacement cookie pair', async () => {
    const user = await createRequiredTestUser()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), uid: user.id })
    await revokeSession(tokens.sessionToken.payload.sid)
    const { context, cookieWrites } = createRequestContext({
      dt: tokens.deviceToken.token,
      st: tokens.sessionToken.token,
    })

    const [firstSession, secondSession] = await Promise.all([
      context.getSessionTokenData(),
      context.getSessionTokenData(),
    ])

    expect(firstSession).toBe(secondSession)
    expect(firstSession.uid).toBeNull()
    await expect(context.getCurrentUser()).resolves.toBeNull()
    const replacement = await verifyOnlyCookiePair(cookieWrites)
    expect(replacement.uid).toBeNull()
    expectUuidV7(replacement.did)
    expectUuidV7(replacement.sid)
    expect(firstSession).toMatchObject({
      did: replacement.did,
      sid: replacement.sid,
      uid: replacement.uid,
      dc: replacement.dc,
    })
    expect(cookieWrites).toHaveLength(2)
  })

  it('removes expired membership claims without rotating credentials during SSR', async () => {
    const user = await createRequiredTestUser()
    const expiresAt = new Date(Date.now() - 60_000)
    const membership = await createTestMembership({ user_id: user.id, plan: 'plus' })
    await updateTestMembershipExpiresAt(membership.id, expiresAt)
    const tokens = await createDeviceAndSessionTokens({
      did: v7(),
      uid: user.id,
      membershipPlan: 'plus',
      membershipExpiresAt: expiresAt,
      trustTier: 4,
    })
    await updateTestMembershipExpiresAt(membership.id, new Date(Date.now() - 60_000))
    const { context, cookieWrites } = createRequestContext()

    const session = await context.getSessionTokenData(
      tokens.sessionToken.token,
      tokens.deviceToken.token,
    )

    if (!session.uid) throw new Error('Expected expired membership session to remain authenticated')
    expect(session).toMatchObject({ uid: user.id, mpl: null })
    expect(session.tt).toEqual(expect.any(Number))
    expect(session.tt).not.toBe(4)
    expect(cookieWrites).toEqual([])
  })

  it.each(['stale', 'deadline'] as const)(
    'enriches %s claims once without rotating credentials or resetting original identity',
    async reason => {
      const user = await createRequiredTestUser()
      const tokens = await createDeviceAndSessionTokens({
        did: v7(),
        uid: user.id,
        deviceClass: 'attested',
      })
      const st = await signSessionJwt(
        {
          ...tokens.sessionToken.payload,
          rol: ['administrator'],
          tt: 9,
          sca: 0,
          ...(reason === 'deadline' && { rca: 0 }),
        },
        { expiresIn: '30 days' },
      )
      if (reason === 'stale') await markJwtStale(user.id)
      const original = await verifyDeviceAndSessionTokens({
        deviceToken: tokens.deviceToken.token,
        sessionToken: st,
      })
      if (!original) throw new Error('Expected signed authority')
      const { context, cookieWrites } = createRequestContext({ dt: tokens.deviceToken.token, st })
      const [first, second] = await Promise.all([
        context.getSessionTokenData(),
        context.getSessionTokenData(),
      ])
      expect(first).toBe(second)
      expect(first).toMatchObject({
        uid: original.uid,
        did: original.did,
        sid: original.sid,
        client: original.client,
        dc: original.dc,
        iat: original.iat,
        exp: original.exp,
        device_iat: original.device_iat,
        device_exp: original.device_exp,
        rol: user.roles,
      })
      const loadedUser = context.currentUser
      expect(loadedUser?.id).toBe(user.id)
      await expect(context.getCurrentUser()).resolves.toBe(loadedUser)
      expect(cookieWrites).toEqual([])
      const marker = await sessionValkeyClient.get(getJwtStaleKey(user.id))
      expect(marker !== null).toBe(reason === 'stale')
    },
  )

  it('does not renew an expired access credential during server-side authentication', async () => {
    const user = await createRequiredTestUser()
    const tokens = await createDeviceAndSessionTokens({ did: v7(), uid: user.id })
    const st = await signSessionJwt(tokens.sessionToken.payload, {
      expiresIn: new Date(Date.now() - 60_000),
    })
    const { context, cookieWrites } = createRequestContext({ dt: tokens.deviceToken.token, st })
    await expect(context.getCurrentUser()).resolves.toBeNull()
    expect(cookieWrites).toEqual([])
    expect(context.sessionTokenData?.uid).toBeNull()
  })

  it('reuses one synthetic device id when request cookies are missing', async () => {
    const { context, cookieWrites } = createRequestContext()

    const [deviceData, sessionData] = await Promise.all([
      context.getDeviceTokenData(),
      context.getSessionTokenData(),
    ])

    expect(deviceData.did).toBe(sessionData.did)
    expectUuidV7(deviceData.did)
    expect(sessionData.uid).toBeNull()
    expect(cookieWrites).toEqual([])
  })

  it('reuses the listener bootstrap device id for an invalid device token', async () => {
    const request = {} as Context['req']
    const bootstrapDeviceId = v7()
    cacheBootstrapDeviceId(request, bootstrapDeviceId)
    const { context, cookieWrites } = createRequestContext({ dt: 'invalid-device-token' }, request)

    await expect(context.getDeviceTokenData()).resolves.toEqual({ did: bootstrapDeviceId })
    expect(cookieWrites).toEqual([])
  })
})

async function createRequiredTestUser() {
  const user = await createTestUser()
  if (!user) throw new Error('Expected test user fixture to resolve')
  return user
}
