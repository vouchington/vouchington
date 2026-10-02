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

  it('mints a session for a suspended user', async () => {
    const user = await createTestUser()
    await suspendTestUser(user.id)
    const suspendedUser = (await getTestPrivateUserById(user.id))!

    const result = await completeMfaLoginWithContext(
      {
        userId: user.id,
        deviceId: v7(),
        sessionId: v7(),
      },
      suspendedUser,
    )
    expect(result.userId).toBe(user.id)
    expect(result.sessionToken.payload.uid).toBe(user.id)

    await unsuspendTestUser(user.id)
  }, 20_000)

  it('refuses to mint a session when the loaded account is not the attempt user', async () => {
    const attemptUser = await createTestUser()
    const loadedUser = await createTestUser()

    await expect(
      completeMfaLoginWithContext(
        {
          userId: attemptUser.id,
          deviceId: v7(),
          sessionId: v7(),
        },
        loadedUser,
      ),
    ).rejects.toMatchObject({ status: 401, message: 'Login attempt expired or invalid' })
  }, 20_000)

  it('refuses to mint a session when the account no longer exists', async () => {
    await expect(
      completeMfaLoginWithContext(
        {
          userId: v7(),
          deviceId: v7(),
          sessionId: v7(),
        },
        null,
      ),
    ).rejects.toMatchObject({ status: 401, message: 'Login attempt expired or invalid' })
  }, 20_000)
})
