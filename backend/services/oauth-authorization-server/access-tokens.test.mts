import { describe, expect, it } from 'vitest'
import { createTestUserDirect } from '@voucha/test-helpers/entities/users'
import { isOAuthAccessToken } from './access-tokens.mts'
import { issueTestOAuthTokens } from './test-support.mts'

describe('isOAuthAccessToken', () => {
  it('recognizes issued access tokens but not refresh tokens or API keys', async () => {
    const tokens = await issueTestOAuthTokens(await createTestUserDirect())

    expect(isOAuthAccessToken(tokens.access_token)).toBe(true)
    expect(isOAuthAccessToken(tokens.refresh_token)).toBe(false)
    expect(isOAuthAccessToken(`voucha_mcp_${'0'.repeat(32)}_${'0'.repeat(16)}`)).toBe(false)
  })
})
