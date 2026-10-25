import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createWorkerSecretValidator, isAdminDashboardRequest } from './dashboard-auth.mts'
import {
  createDeviceAndSessionTokens,
  revokeSession,
  verifyDeviceAndSessionTokens,
} from '@services/jwt-session'
import { revokeUserSessionsBefore } from '@services/jwt-session/session-revocation-keys'
import { addTestUserRole } from '@voucha/test-helpers'
import { createTestSessionCookies } from '@voucha/test-helpers/services/jwt-session/index'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'

function req(headers: IncomingHttpHeaders): IncomingMessage {
  return { headers } as IncomingMessage
}

describe('dashboard auth', () => {
  it('validates the worker secret in constant-shape header flow', () => {
    const isValid = createWorkerSecretValidator('secret-value')
    expect(isValid(req({ 'x-cf-worker-secret': 'secret-value' }))).toBe(true)
    expect(isValid(req({ 'x-cf-worker-secret': 'wrong' }))).toBe(false)
    expect(isValid(req({ 'x-cf-worker-secret': ['secret-value'] }))).toBe(false)
  })

  it('rejects revoked admin sessions', async () => {
    const { dtCookie, stCookie, userId, sid } = await createTestSessionCookies()
    await addTestUserRole(userId, 'administrator')
    await revokeSession(sid)

    await expect(
      isAdminDashboardRequest(req({ cookie: `${dtCookie}; ${stCookie}` })),
    ).resolves.toBe(false)
  })

  it('allows non-revoked users with queue stats permission', async () => {
    const { dtCookie, stCookie, userId } = await createTestSessionCookies()
    await addTestUserRole(userId, 'administrator')
    const cookie = `${dtCookie}; ${stCookie}`

    await expect(isAdminDashboardRequest(req({ cookie }))).resolves.toBe(true)

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: dtCookie.slice(3),
      sessionToken: stCookie.slice(3),
    })
    if (!verified || verified.iat === undefined) throw new Error('Expected an issued session')
    await revokeUserSessionsBefore(userId, verified.iat)

    await expect(isAdminDashboardRequest(req({ cookie }))).resolves.toBe(false)
  })

  it('rejects an administrator session from a different browser agent', async () => {
    const { dtCookie, userId } = await createTestSessionCookies()
    await addTestUserRole(userId, 'administrator')
    const device = await verifyDeviceJwt(dtCookie.slice(3))
    if (!device) throw new Error('Expected the test device credential')
    const bound = await createDeviceAndSessionTokens({
      uid: userId,
      did: device.did,
      deviceContext: { user_agent: 'Original browser agent' },
    })
    const cookie = `dt=${bound.deviceToken.token}; st=${bound.sessionToken.token}`

    await expect(
      isAdminDashboardRequest(req({ cookie, 'user-agent': 'Original browser agent' })),
    ).resolves.toBe(true)
    await expect(
      isAdminDashboardRequest(req({ cookie, 'user-agent': 'Different browser agent' })),
    ).resolves.toBe(false)
  })
})
