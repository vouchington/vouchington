import { beforeAll, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestOAuthAccountSweepWindow } from '@voucha/test-helpers/oauth-account-sweep-window'
import {
  createTestUser,
  insertTestOAuthAccount,
  connectTestOAuthAccount,
  setTestOAuthAccountTokens,
  setTestOAuthAccountFriendsSyncedAt,
  setTestOAuthAccountTokenExpiry,
  readTestDatabaseTimestamp,
} from '@voucha/test-helpers'
import {
  streamFacebookAccountsToSync,
  streamXAccountsToSync,
  streamGithubAccountsToSync,
  getFriendSyncProviderUserId,
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
  let accountId: string

  beforeAll(async () => {
    const user = await createTestUser()
    accountId = (await insertTestOAuthAccount('facebook', facebookUserId)).account_id!
    await connectTestOAuthAccount('facebook', user.id, facebookUserId)
    await setTestOAuthAccountTokens('facebook', facebookUserId, { accessToken: 'test_token' })
  })

  it('rejects an unknown runtime provider when reading a linked account', async () => {
    await expect(
      getFriendSyncProviderUserId('unknown' as 'facebook', crypto.randomUUID()),
    ).rejects.toThrow('Unknown friend sync provider')
  })

  it('yields accounts that have never synced', async () => {
    const results = await collectStream(streamFacebookAccountsToSync())
    const ids = results.map(r => r.id)
    expect(ids).toContain(accountId)
    await expect(getFriendSyncProviderUserId('facebook', accountId)).resolves.toBe(facebookUserId)
  })

  it('excludes recently synced accounts', async () => {
    await setTestOAuthAccountFriendsSyncedAt('facebook', facebookUserId, 'now')
    const results = await collectStream(streamFacebookAccountsToSync())
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(accountId)
  })

  it('advances the retained scan cursor across an ineligible page', async () => {
    const window = createTestOAuthAccountSweepWindow()
    const firstProviderId = `sparse-first-${randomUUID()}`
    const secondProviderId = `sparse-second-${randomUUID()}`
    for (const [providerId, accountId] of [
      [firstProviderId, window.firstId],
      [secondProviderId, window.secondId],
    ] as const) {
      const owner = await createTestUser()
      await insertTestOAuthAccount('facebook', providerId, null, accountId)
      await connectTestOAuthAccount('facebook', owner.id, providerId)
      await setTestOAuthAccountTokens('facebook', providerId, { accessToken: 'synthetic-token' })
    }
    await setTestOAuthAccountFriendsSyncedAt('facebook', firstProviderId, 'now')
    const sweepStartedAt = await readTestDatabaseTimestamp()
    let firstProgress: { rowsRead: number; hasMore: boolean; lastRow?: { id: string } } | undefined
    const firstPage = await collectStream(
      streamFacebookAccountsToSync({
        sweepStartedAt,
        upperId: window.secondId,
        afterId: window.afterId,
        limits: { batchSize: 1, maxRows: 1 },
        onComplete: result => {
          firstProgress = result
        },
      }),
    )
    expect(firstPage).toEqual([])
    expect(firstProgress).toMatchObject({
      rowsRead: 1,
      hasMore: true,
      lastRow: { id: window.firstId },
    })
    const resumed = await collectStream(
      streamFacebookAccountsToSync({
        sweepStartedAt,
        upperId: window.secondId,
        afterId: firstProgress?.lastRow?.id,
        limits: { batchSize: 1, maxRows: 1 },
      }),
    )
    expect(resumed).toEqual([{ id: window.secondId }])
  })

  it('charges a lookahead row against the physical read budget and resumes it', async () => {
    const window = createTestOAuthAccountSweepWindow()
    for (const [providerId, accountId] of [
      [`budget-first-${randomUUID()}`, window.firstId],
      [`budget-second-${randomUUID()}`, window.secondId],
    ] as const) {
      const owner = await createTestUser()
      await insertTestOAuthAccount('facebook', providerId, null, accountId)
      await connectTestOAuthAccount('facebook', owner.id, providerId)
      await setTestOAuthAccountTokens('facebook', providerId, { accessToken: 'synthetic-token' })
    }
    const sweepStartedAt = await readTestDatabaseTimestamp()
    let progress: { rowsRead: number; hasMore: boolean; lastRow?: { id: string } } | undefined
    const first = await collectStream(
      streamFacebookAccountsToSync({
        sweepStartedAt,
        upperId: window.secondId,
        afterId: window.afterId,
        limits: { batchSize: 1, maxRows: 2 },
        onComplete: result => {
          progress = result
        },
      }),
    )
    expect(first).toEqual([{ id: window.firstId }])
    expect(progress).toMatchObject({
      rowsRead: 2,
      hasMore: true,
      lastRow: { id: window.firstId },
    })
    const resumed = await collectStream(
      streamFacebookAccountsToSync({
        sweepStartedAt,
        upperId: window.secondId,
        afterId: progress?.lastRow?.id,
        limits: { batchSize: 1, maxRows: 1 },
      }),
    )
    expect(resumed).toEqual([{ id: window.secondId }])
  })
})

describe('streamGithubAccountsToSync', () => {
  const githubUserId = `gh_sync_test_${Math.random().toString(36).slice(2, 10)}`
  let accountId: string

  beforeAll(async () => {
    const user = await createTestUser()
    accountId = (await insertTestOAuthAccount('github', githubUserId)).account_id!
    await connectTestOAuthAccount('github', user.id, githubUserId)
    await setTestOAuthAccountTokens('github', githubUserId, { accessToken: 'test_token' })
  })

  it('yields accounts that have never synced', async () => {
    const results = await collectStream(streamGithubAccountsToSync())
    const ids = results.map(r => r.id)
    expect(ids).toContain(accountId)
  })
})

describe('streamXAccountsToSync', () => {
  const xUserId = `x_sync_test_${Math.random().toString(36).slice(2, 10)}`
  let accountId: string

  beforeAll(async () => {
    const user = await createTestUser()
    accountId = (await insertTestOAuthAccount('x', xUserId)).account_id!
    await connectTestOAuthAccount('x', user.id, xUserId)
    await setTestOAuthAccountTokens('x', xUserId, {
      accessToken: 'test_token',
      refreshToken: 'test_refresh',
    })
  })

  it('yields accounts with valid tokens that have never synced', async () => {
    const results = await collectStream(streamXAccountsToSync())
    const ids = results.map(r => r.id)
    expect(ids).toContain(accountId)
  })

  it('excludes accounts with expired tokens and no refresh token', async () => {
    await setTestOAuthAccountTokenExpiry('x', xUserId, true)
    await setTestOAuthAccountTokens('x', xUserId, { refreshToken: null })
    const results = await collectStream(streamXAccountsToSync())
    const ids = results.map(r => r.id)
    expect(ids).not.toContain(accountId)
  })
})
