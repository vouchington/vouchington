import { describe, expect, it } from 'vitest'
import { v7 } from 'uuid'
import {
  beginTransaction,
  createTestUser,
  setTestOAuthAccountData,
  setTestOAuthAccountTokens,
  setTestOAuthAccountTokenExpiry,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  getTestOAuthAccountRaw,
  getTestFriend,
  insertTestFriend,
} from '@voucha/test-helpers'
import { getTestOAuthAccountEmailDomainHostnameId } from '@voucha/test-helpers/entities/oauth-accounts'
import { withCapturedTestQueries } from '@voucha/test-helpers/query-capture'
import { sanitizeOAuthAccountPii } from './delete-oauth-pii.mts'
import { deleteUserAndDrainForTest } from '@voucha/test-helpers/services/users/delete-test-support'

describe('sanitizeOAuthAccountPii (via deleteUser)', () => {
  it('completes successfully when user has no connected OAuth accounts', async () => {
    const user = await createTestUser()
    await expect(deleteUserAndDrainForTest(user, user)).resolves.not.toThrow()
  })

  it('nulls out email, data, and tokens for a connected Facebook account', async () => {
    const user = await createTestUser()
    const fbId = `fb-pii-test-${v7()}`
    await insertTestOAuthAccount('facebook', fbId, `tests+fb-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('facebook', user.id, fbId)
    const friendProviderId = `fb-friend-${v7()}`
    await insertTestFriend('facebook', fbId, friendProviderId)

    await deleteUserAndDrainForTest(user, user)

    const account = await getTestOAuthAccountRaw('facebook', fbId)
    expect(account?.user_id).toBeNull()
    expect(account?.provider_user_email_address).toBeNull()
    expect(account?.provider_user_data).toEqual({})
    await expect(getTestFriend('facebook', fbId, friendProviderId)).resolves.toHaveLength(0)
  })

  it('nulls out tokens for a connected GitHub account', async () => {
    const user = await createTestUser()
    const ghId = `gh-pii-test-${v7()}`
    await insertTestOAuthAccount('github', ghId, `tests+gh-${v7()}@voucha.ai`)
    await connectTestOAuthAccount('github', user.id, ghId)

    await deleteUserAndDrainForTest(user, user)

    const account = await getTestOAuthAccountRaw('github', ghId)
    expect(account?.user_id).toBeNull()
    expect(account?.provider_user_email_address).toBeNull()
    expect(account?.provider_user_data).toEqual({})
  })
})

describe('sanitizeOAuthAccountPii transaction', () => {
  it('clears all seven providers only for the target user and remains caller-rollbackable', async () => {
    const user = await createTestUser()
    const otherUser = await createTestUser()
    const providers = [
      'facebook',
      'apple',
      'google',
      'x',
      'linkedin',
      'microsoft',
      'github',
    ] as const
    const fixtures = []
    for (const provider of providers) {
      for (const owner of [user, otherUser]) {
        const providerUserId = `${provider}-pii-${v7()}`
        await insertTestOAuthAccount(provider, providerUserId, `tests+${v7()}@voucha.ai`)
        await connectTestOAuthAccount(provider, owner.id, providerUserId)
        await setTestOAuthAccountData(provider, providerUserId, { privateName: providerUserId })
        if (provider !== 'apple' && provider !== 'google') {
          await setTestOAuthAccountTokens(provider, providerUserId, {
            accessToken: `access-${v7()}`,
            ...(provider === 'facebook' ? {} : { refreshToken: `refresh-${v7()}` }),
          })
          await setTestOAuthAccountTokenExpiry(provider, providerUserId, false)
        }
        fixtures.push({
          provider,
          providerUserId,
          ownerId: owner.id,
          before: await getTestOAuthAccountRaw(provider, providerUserId),
          emailDomainId:
            provider === 'x'
              ? null
              : await getTestOAuthAccountEmailDomainHostnameId(provider, providerUserId),
        })
      }
    }

    await using rolledBack = await beginTransaction()
    await expect(sanitizeOAuthAccountPii(user.id, rolledBack)).resolves.toBeUndefined()
    await rolledBack.rollback()
    for (const fixture of fixtures) {
      await expect(
        getTestOAuthAccountRaw(fixture.provider, fixture.providerUserId),
      ).resolves.toEqual(fixture.before)
    }

    await using committed = await beginTransaction()
    const { result, queries } = await withCapturedTestQueries(() =>
      sanitizeOAuthAccountPii(user.id, committed),
    )
    expect(result).toBeUndefined()
    expect(queries).toHaveLength(1)
    await committed.commit()
    for (const fixture of fixtures) {
      const account = await getTestOAuthAccountRaw(fixture.provider, fixture.providerUserId)
      const expected =
        fixture.ownerId === otherUser.id
          ? fixture.before
          : {
              user_id: null,
              provider_user_email_address: null,
              provider_user_data: {},
              access_token: null,
              refresh_token: null,
              access_token_expires_at: null,
            }
      expect(account).toEqual(expected)
      const emailDomainId =
        fixture.provider === 'x'
          ? null
          : await getTestOAuthAccountEmailDomainHostnameId(fixture.provider, fixture.providerUserId)
      expect(emailDomainId).toBe(fixture.ownerId === otherUser.id ? fixture.emailDomainId : null)
    }
  })
})
