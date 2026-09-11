import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { getTestOAuthAccountCiphertexts } from '@voucha/test-helpers'
import { getOAuthAccountByProviderUserId } from './connect.mts'
import { upsertOAuthAccount } from './upsert.mts'

describe('upsertOAuthAccount', () => {
  it('merges omitted Apple profile fields on conflict', async () => {
    const providerUserId = `apple-data-merge-${randomUUID()}`
    const email = `tests+${providerUserId}@voucha.ai`
    await upsertOAuthAccount('apple', providerUserId, email, {
      name: 'One-time Apple Name',
      email,
    })

    const account = await upsertOAuthAccount('apple', providerUserId, email, {
      email,
      is_private_email: true,
    })

    expect(account.provider_user_data).toEqual({
      name: 'One-time Apple Name',
      email,
      is_private_email: true,
    })
  })

  it('replaces profile data for providers configured for replacement', async () => {
    const providerUserId = `github-data-replace-${randomUUID()}`
    const email = `tests+${providerUserId}@voucha.ai`
    await upsertOAuthAccount('github', providerUserId, email, {
      login: 'old-login',
      name: 'Old Name',
    })

    const account = await upsertOAuthAccount('github', providerUserId, email, {
      login: 'new-login',
    })

    expect(account.provider_user_data).toEqual({ login: 'new-login' })
  })

  it('stores OAuth tokens as encrypted ciphertext and does not return token material', async () => {
    const providerUserId = `github-token-storage-${randomUUID()}`
    const account = await upsertOAuthAccount(
      'github',
      providerUserId,
      `tests+${providerUserId}@voucha.ai`,
      { login: providerUserId },
      {
        accessToken: 'github-access-token-secret',
        refreshToken: 'github-refresh-token-secret',
        accessTokenExpiresAt: new Date(Date.now() + 60_000),
      },
    )

    expect(account).not.toHaveProperty('access_token')
    expect(account).not.toHaveProperty('refresh_token')

    const ciphertexts = await getTestOAuthAccountCiphertexts('github', providerUserId)

    expect(ciphertexts?.access_token_ciphertext).toMatch(/^v1:/)
    expect(ciphertexts?.refresh_token_ciphertext).toMatch(/^v1:/)
    expect(ciphertexts?.access_token_ciphertext).not.toContain('github-access-token-secret')
    expect(ciphertexts?.refresh_token_ciphertext).not.toContain('github-refresh-token-secret')
  })

  it('requires a fencing claim when completing a durable authorization', async () => {
    const providerUserId = `github-authorization-${randomUUID()}`

    await expect(
      upsertOAuthAccount(
        'github',
        providerUserId,
        `tests+${providerUserId}@voucha.ai`,
        { login: providerUserId },
        undefined,
        { authorizationId: randomUUID() },
      ),
    ).rejects.toThrow('authorizationClaimId is required with authorizationId')

    await expect(getOAuthAccountByProviderUserId('github', providerUserId)).resolves.toBeNull()
  })
})
