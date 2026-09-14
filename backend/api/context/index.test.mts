import { afterEach, describe, expect, it, vi } from 'vitest'
import applyContext from './index.mts'
import type { Application, Context, CookieOptions } from '@jongleberry/api-server'
import { createDeviceAndSessionTokens, verifyDeviceAndSessionTokens } from '@services/jwt-session'
import { revokeSession } from '@services/jwt-session/revocation'
import {
  expectUuidV7,
  legacyUuidV4,
  signLegacyDeviceJwt,
  signLegacySessionJwt,
} from '@voucha/test-helpers/services/jwt-session/index'
import { cacheBootstrapDeviceId } from '@modules/request-client-info'
import { ATTESTED_SESSION_EXPIRATION_SECONDS, isUUIDv7 } from '@ts-shared/session-jwt'
import {
  createTestMembership,
  createTestUser,
  softDeleteUser,
  updateTestMembershipExpiresAt,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'

type CookieWrite = {
  name: string
  value: string
  options?: CookieOptions
}

const contextExtensions: Record<string, unknown> = {}
const contextApplicationAdapter = {
  extend(methods: Record<string, unknown>) {
    Object.assign(contextExtensions, methods)
  },
}
applyContext(contextApplicationAdapter as unknown as Application)

describe('server request context', () => {
  afterEach(() => vi.useRealTimers())

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

  it('re-mints legacy UUIDv4 identifiers as UUIDv7 identifiers', async () => {
    const user = await createRequiredTestUser()
    const legacyDid = legacyUuidV4()
    const legacySid = legacyUuidV4()
    const [deviceToken, sessionToken] = await Promise.all([
      signLegacyDeviceJwt({ did: legacyDid }),
      signLegacySessionJwt({ did: legacyDid, sid: legacySid, uid: user.id }),
    ])
    await softDeleteUser(user.id)
    const { context, cookieWrites } = createRequestContext({ dt: deviceToken, st: sessionToken })

    await expect(context.getCurrentUser()).resolves.toBeNull()

    const replacement = await verifyOnlyCookiePair(cookieWrites)
    expect(isUUIDv7(replacement.did)).toBe(true)
    expect(isUUIDv7(replacement.sid)).toBe(true)
    expect(replacement.did).not.toBe(legacyDid)
    expect(replacement.sid).not.toBe(legacySid)
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

  it('cold-refreshes expired membership claims before exposing them to route limiting', async () => {
    const user = await createRequiredTestUser()
    const expiresAt = new Date(Date.now() + 60_000)
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
    vi.useFakeTimers()
    vi.setSystemTime(new Date(expiresAt.getTime() + 1_000))
    const { context, cookieWrites } = createRequestContext()

    const session = await context.getSessionTokenData(
      tokens.sessionToken.token,
      tokens.deviceToken.token,
    )

    if (!session.uid) throw new Error('Expected expired membership session to remain authenticated')
    expect(session).toMatchObject({ uid: user.id, mpl: null })
    expect(session.tt).toEqual(expect.any(Number))
    expect(session.tt).not.toBe(4)
    await expect(verifyOnlyCookiePair(cookieWrites)).resolves.toMatchObject({
      uid: user.id,
      mpl: null,
      tt: session.tt,
    })
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

function createRequestContext(
  cookies: Readonly<Partial<Record<string, string>>> = {},
  request: Context['req'] = {} as Context['req'],
): { context: Context; cookieWrites: CookieWrite[] } {
  const incomingCookies = Object.freeze({ ...cookies })
  const cookieWrites: CookieWrite[] = []
  const context = {
    req: request,
    cookies: {
      get(name: string): string | undefined {
        return incomingCookies[name]
      },
      set(name: string, value: string, options?: CookieOptions): void {
        cookieWrites.push({ name, value, options })
      },
    },
  } as unknown as Context
  Object.assign(context, contextExtensions)
  return { context, cookieWrites }
}

async function createRequiredTestUser() {
  const user = await createTestUser()
  if (!user) throw new Error('Expected test user fixture to resolve')
  return user
}

function getOnlyCookieWrite(cookieWrites: CookieWrite[], name: string): CookieWrite {
  const matchingWrites = cookieWrites.filter(write => write.name === name)
  expect(matchingWrites).toHaveLength(1)
  return matchingWrites[0]!
}

async function verifyOnlyCookiePair(cookieWrites: CookieWrite[]) {
  expect(cookieWrites).toHaveLength(2)
  const result = await verifyDeviceAndSessionTokens({
    deviceToken: getOnlyCookieWrite(cookieWrites, 'dt').value,
    sessionToken: getOnlyCookieWrite(cookieWrites, 'st').value,
  })
  expect(result).not.toBe(false)
  if (!result) throw new Error('Expected replacement authentication cookies to verify')
  return result
}
