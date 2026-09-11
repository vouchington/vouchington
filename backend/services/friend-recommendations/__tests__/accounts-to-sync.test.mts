import { beforeAll, describe, expect, it } from 'vitest'
import {
  createTestUser,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  setTestOAuthAccountTokens,
  setTestOAuthAccountFriendsSyncedAt,
  setTestOAuthAccountTokenExpiry,
} from '@voucha/test-helpers'
import {
  streamFacebookAccountsToSync,
  streamXAccountsToSync,
  streamGithubAccountsToSync,
} from '../accounts-to-sync.mts'

async function collectStream<T>(gen: AsyncGenerator<T>): Promise<T[]> {
  const results: T[] = []
  for await (const item of gen) {
    results.push(item)
  }
  return results
}

describe('streamFacebookAccountsToSync', () => {
  const facebookUserId = `fb_sync_test_${Math.random().toString(36).slice(2, 10)}`

  beforeAll(async () => {
    const user = await createTestUser()
    await insertTestOAuthAccount('facebook', facebookUserId)
    await connectTestOAuthAccount('facebook', user.id, facebookUserId)
    await setTestOAuthAccountTokens('facebook', facebookUserId, { accessToken: 'test_token' })
  })

  it('yields accounts that have never synced', async () => {
    const results = await collectStream(streamFacebookAccountsToSync())
    const ids = results.map(r => r.provider_user_id)
    expect(ids).toContain(facebookUserId)
  })

  it('excludes recently synced accounts', async () => {
    await setTestOAuthAccountFriendsSyncedAt('facebook', facebookUserId, 'now')
    const results = await collectStream(streamFacebookAccountsToSync())
    const ids = results.map(r => r.provider_user_id)
    expect(ids).not.toContain(facebookUserId)
  })
})

describe('streamGithubAccountsToSync', () => {
  const githubUserId = `gh_sync_test_${Math.random().toString(36).slice(2, 10)}`

  beforeAll(async () => {
    const user = await createTestUser()
    await insertTestOAuthAccount('github', githubUserId)
    await connectTestOAuthAccount('github', user.id, githubUserId)
    await setTestOAuthAccountTokens('github', githubUserId, { accessToken: 'test_token' })
  })

  it('yields accounts that have never synced', async () => {
    const results = await collectStream(streamGithubAccountsToSync())
    const ids = results.map(r => r.provider_user_id)
    expect(ids).toContain(githubUserId)
  })
})

describe('streamXAccountsToSync', () => {
  const xUserId = `x_sync_test_${Math.random().toString(36).slice(2, 10)}`

  beforeAll(async () => {
    const user = await createTestUser()
    await insertTestOAuthAccount('x', xUserId)
    await connectTestOAuthAccount('x', user.id, xUserId)
    await setTestOAuthAccountTokens('x', xUserId, {
      accessToken: 'test_token',
      refreshToken: 'test_refresh',
    })
  })

  it('yields accounts with valid tokens that have never synced', async () => {
    const results = await collectStream(streamXAccountsToSync())
    const ids = results.map(r => r.provider_user_id)
    expect(ids).toContain(xUserId)
  })

  it('excludes accounts with expired tokens and no refresh token', async () => {
    await setTestOAuthAccountTokenExpiry('x', xUserId, true)
    await setTestOAuthAccountTokens('x', xUserId, { refreshToken: null })
    const results = await collectStream(streamXAccountsToSync())
    const ids = results.map(r => r.provider_user_id)
    expect(ids).not.toContain(xUserId)
  })
})
