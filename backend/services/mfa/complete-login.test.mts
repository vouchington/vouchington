import { describe, expect, it } from 'vitest'
import {
  createTestUser,
  getTestPrivateUserById,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { v7 } from 'uuid'
import * as jose from 'jose'
import { completeMfaLoginWithContext } from './complete-login.mts'

describe('completeMfaLoginWithContext', () => {
  it('returns tokens for an active user', async () => {
    const user = await createTestUser()
    const anonymousSessionId = v7()

    const result = await completeMfaLoginWithContext(
      {
        userId: user.id,
        deviceId: v7(),
        sessionId: anonymousSessionId,
      },
      user,
    )

    expect(result.userId).toBe(user.id)
    expect(result.deviceClass).toBeUndefined()
    expect(result.deviceToken.token).toBeTruthy()
    expect(result.sessionToken.token).toBeTruthy()
    expect(result.sessionToken.payload.sid).not.toBe(anonymousSessionId)
  }, 20_000)

  it('mints a 30-day session and reports deviceClass when the attempt carries one', async () => {
    const user = await createTestUser()

    const result = await completeMfaLoginWithContext(
      {
        userId: user.id,
        deviceId: v7(),
        sessionId: v7(),
        deviceClass: 'attested',
      },
      user,
    )

    expect(result.deviceClass).toBe('attested')
    const decoded = jose.decodeJwt(result.sessionToken.token)
    const lifetimeSeconds = (decoded.exp as number) - (decoded.iat as number)
    expect(lifetimeSeconds).toBeGreaterThanOrEqual(30 * 24 * 60 * 60 - 1)
    expect(lifetimeSeconds).toBeLessThanOrEqual(30 * 24 * 60 * 60 + 1)
  }, 20_000)

  it('throws 403 for a suspended user', async () => {
    const user = await createTestUser()
    await suspendTestUser(user.id)
    const suspendedUser = (await getTestPrivateUserById(user.id))!

    await expect(
      completeMfaLoginWithContext(
        {
          userId: user.id,
          deviceId: v7(),
          sessionId: v7(),
        },
        suspendedUser,
      ),
    ).rejects.toMatchObject({ status: 403, message: 'Account suspended' })

    await unsuspendTestUser(user.id)
  }, 20_000)
})
