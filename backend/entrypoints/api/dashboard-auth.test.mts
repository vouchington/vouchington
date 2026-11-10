import type { IncomingHttpHeaders, IncomingMessage } from 'node:http'
import { describe, expect, it } from 'vitest'
import { createWorkerSecretValidator, isAdminDashboardRequest } from './dashboard-auth.mts'
import { revokeSession, verifyDeviceAndSessionTokens } from '@services/jwt-session'
import { revokeUserSessionsBefore } from '@services/jwt-session/session-revocation-keys'
import { addTestUserRole } from '@voucha/test-helpers'
import { createTestSessionCookies } from '@voucha/test-helpers/services/jwt-session/index'
import { createVerifiedMfaTestSession } from '@voucha/test-helpers/authenticated-session'

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

  it('requires completed MFA before a current administrator can access queue stats', async () => {
    const { dtCookie, stCookie, userId } = await createTestSessionCookies()
    await addTestUserRole(userId, 'administrator')
    await expect(
      isAdminDashboardRequest(req({ cookie: `${dtCookie}; ${stCookie}` })),
    ).resolves.toBe(false)

    const assured = await createVerifiedMfaTestSession(userId)
    const cookie = `dt=${assured.deviceToken.token}; st=${assured.sessionToken.token}`
    await expect(isAdminDashboardRequest(req({ cookie }))).resolves.toBe(true)

    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: assured.deviceToken.token,
      sessionToken: assured.sessionToken.token,
    })
    if (!verified || verified.iat === undefined) throw new Error('Expected an issued session')
    await revokeUserSessionsBefore(userId, verified.iat)

    await expect(isAdminDashboardRequest(req({ cookie }))).resolves.toBe(false)
  })

  it('rejects an MFA-assured administrator session from a different browser agent', async () => {
    const { userId } = await createTestSessionCookies()
    await addTestUserRole(userId, 'administrator')
    const assured = await createVerifiedMfaTestSession(userId, {
      user_agent: 'Original browser agent',
    })
    const cookie = `dt=${assured.deviceToken.token}; st=${assured.sessionToken.token}`

    await expect(
      isAdminDashboardRequest(req({ cookie, 'user-agent': 'Original browser agent' })),
    ).resolves.toBe(true)
    await expect(
      isAdminDashboardRequest(req({ cookie, 'user-agent': 'Different browser agent' })),
    ).resolves.toBe(false)
  })
})
