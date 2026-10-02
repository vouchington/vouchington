import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { suspendTestUser, unsuspendTestUser } from '@voucha/test-helpers'
import { createTestSessionCookies } from '@voucha/test-helpers/services/jwt-session/index'
import { isSessionRevoked, verifyDeviceAndSessionTokens } from '@services/jwt-session'

describe('POST /api/v1/auth/logout for suspended users', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it('still revokes the caller session and clears its cookies', async () => {
    const { dtCookie, stCookie, userId } = await createTestSessionCookies()
    const verified = await verifyDeviceAndSessionTokens({
      deviceToken: dtCookie.slice(3),
      sessionToken: stCookie.slice(3),
    })
    expect(verified).not.toBe(false)
    if (!verified) throw new Error('Expected an authenticated session')

    suspendedUserIds.push(userId)
    await suspendTestUser(userId)
    const response = await createRequest()
      .post('/api/v1/auth/logout')
      .set('Cookie', `${dtCookie}; ${stCookie}`)
      .expect(204)

    expect(response.headers['set-cookie']).toEqual(
      expect.arrayContaining([expect.stringContaining('dt='), expect.stringContaining('st=')]),
    )
    await expect(isSessionRevoked(verified.sid)).resolves.toBe(true)
  })
})
