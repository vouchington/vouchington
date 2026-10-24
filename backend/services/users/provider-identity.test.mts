import { describe, expect, it, onTestFinished } from 'vitest'
import { v7 } from 'uuid'
import { createRandomEmailAddress, insertTestOAuthAccount } from '@voucha/test-helpers'
import { getOAuthAccountByProviderUserId } from '@services/oauth-accounts'
import { deleteTestOAuthAccount } from '@voucha/test-helpers/entities/oauth-accounts'
import { upsertUser } from './create.mts'
import { getPrivateUserByAny } from './get.mts'

describe('provider sign-in identities', () => {
  it('concurrent sign-ins for one provider identity converge on its connected user', async () => {
    const providerUserId = `test-github-race-${v7()}`
    const account = await insertTestOAuthAccount('github', providerUserId)
    onTestFinished(() => deleteTestOAuthAccount('github', providerUserId))

    const users = await Promise.all([
      upsertUser({ oauthAccount: { provider: 'github', account } }),
      upsertUser({ oauthAccount: { provider: 'github', account } }),
    ])

    expect(new Set(users.map(user => user.id)).size).toBe(1)
    expect(await getOAuthAccountByProviderUserId('github', providerUserId)).toMatchObject({
      user_id: users[0]!.id,
    })
  })

  it('requires an existing sign-in method before connecting an OAuth account with the same email', async () => {
    const emailAddress = createRandomEmailAddress()
    const existingUser = await upsertUser({ emailAddress })
    const providerUserId = `test-google-${v7()}`
    const account = await insertTestOAuthAccount('google', providerUserId, emailAddress)

    await expect(
      upsertUser({ oauthAccount: { provider: 'google', account } }),
    ).rejects.toMatchObject({
      status: 409,
      code: 'OAUTH_ACCOUNT_EMAIL_CONFLICT',
    })
    expect(await getOAuthAccountByProviderUserId('google', providerUserId)).toMatchObject({
      user_id: null,
    })
    expect(await getPrivateUserByAny(existingUser.id)).toMatchObject({ google_account: null })
  })

  it('email sign-in creates its own identity when only a Microsoft account has the email', async () => {
    const emailAddress = createRandomEmailAddress()
    const providerUserId = `test-microsoft-${v7()}`
    const account = await insertTestOAuthAccount('microsoft', providerUserId, emailAddress)
    const providerUser = await upsertUser({ oauthAccount: { provider: 'microsoft', account } })

    expect(await getPrivateUserByAny(emailAddress)).toBeNull()
    const emailUser = await upsertUser({ emailAddress })
    expect(emailUser.id).not.toBe(providerUser.id)
    expect((await getPrivateUserByAny(emailAddress))?.id).toBe(emailUser.id)
    // A known provider identity remains authoritative after the email identity is registered.
    expect((await upsertUser({ oauthAccount: { provider: 'microsoft', account } })).id).toBe(
      providerUser.id,
    )
  })
})
