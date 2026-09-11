import { describe, expect, it } from 'vitest'
import { upsertProviderAccount } from '../upsert-provider-account.mts'

describe('upsertProviderAccount validation', () => {
  it('requires token credentials for token-based providers before provider calls', async () => {
    await expect(upsertProviderAccount('facebook', {})).rejects.toThrow('token is required')
    await expect(upsertProviderAccount('apple', {})).rejects.toThrow('token is required')
    await expect(upsertProviderAccount('google', {})).rejects.toThrow('credential is required')
  })

  it('requires code-flow fields before provider calls', async () => {
    await expect(upsertProviderAccount('x', {})).rejects.toThrow('code is required')
    await expect(upsertProviderAccount('x', { code: 'c' })).rejects.toThrow(
      'redirectUri is required',
    )
    await expect(
      upsertProviderAccount('x', {
        code: 'c',
        redirectUri: 'https://example.com/auth/callback/x',
      }),
    ).rejects.toThrow('codeVerifier is required')
  })

  it('validates redirectUri for code-based providers when expectedOrigin is given', async () => {
    await expect(
      upsertProviderAccount(
        'github',
        { code: 'c', redirectUri: 'https://evil.com/auth/callback/github' },
        'https://example.com',
      ),
    ).rejects.toThrow('Invalid redirectUri')
  })

  it('throws 400 for unsupported providers', async () => {
    await expect(upsertProviderAccount('myspace' as never, {})).rejects.toThrow(
      'Unsupported provider',
    )
  })
})
