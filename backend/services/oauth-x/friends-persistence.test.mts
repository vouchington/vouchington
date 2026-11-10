import { describe, expect, it } from 'vitest'
import {
  connectTestOAuthAccount,
  createTestUser,
  insertTestOAuthAccount,
} from '@voucha/test-helpers'
import {
  setTestXAccountExpiredToken,
  getTestOAuthAccountAccessToken,
} from '@voucha/test-helpers/entities/friends'
import { softDeleteUser } from '@voucha/test-helpers/entities/users-lifecycle'
import { getXSyncAccount, persistXRefreshedTokens } from './friends-persistence.mts'

describe('X refresh token persistence', () => {
  it('updates only the current credential generation of an active owner', async () => {
    const user = await createTestUser()
    const providerId = `x-refresh-${user.id}`
    await insertTestOAuthAccount('x', providerId)
    await connectTestOAuthAccount('x', user.id, providerId)
    await setTestXAccountExpiredToken(providerId, 'old-access', 'old-refresh')
    const account = await getXSyncAccount(providerId)
    expect(account).toBeDefined()
    const generation = {
      accessTokenCiphertext: account!.accessTokenCiphertext,
      refreshTokenCiphertext: account!.refreshTokenCiphertext,
      accessTokenExpiresAt: account!.accessTokenExpiresAtText,
    }
    const refreshed = { accessToken: 'new-access', refreshToken: 'new-refresh', expiresAt: null }
    expect(await persistXRefreshedTokens(providerId, user.id, generation, refreshed)).toBe(true)
    expect(await persistXRefreshedTokens(providerId, user.id, generation, refreshed)).toBe(false)
    expect(await getTestOAuthAccountAccessToken('x', providerId)).toBe('new-access')

    const current = await getXSyncAccount(providerId)
    await softDeleteUser(user.id)
    expect(
      await persistXRefreshedTokens(
        providerId,
        user.id,
        {
          accessTokenCiphertext: current!.accessTokenCiphertext,
          refreshTokenCiphertext: current!.refreshTokenCiphertext,
          accessTokenExpiresAt: current!.accessTokenExpiresAtText,
        },
        { accessToken: 'late-access', refreshToken: null, expiresAt: null },
      ),
    ).toBe(false)
    expect(await getTestOAuthAccountAccessToken('x', providerId)).toBe('new-access')
  })
})
