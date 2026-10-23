import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  insertTestGithubFriend,
  insertTestOAuthAccount,
  testGithubFriendExists,
} from '@voucha/test-helpers'
import { cleanupSecuritySourcePage } from './cleanup-security-records.mts'

describe('security record cleanup', () => {
  it('uses a durable one-row page and reports remaining old friend observations', async () => {
    const day = 86_400_000
    const now = new Date()
    const providerUserId = `github-retention-${randomUUID()}`
    const account = await insertTestOAuthAccount('github', providerUserId)
    onTestFinished(() => deleteTestOAuthAuthorizationFixtures({ githubUserIds: [providerUserId] }))
    if (!account.account_id) throw new Error('GitHub account ID missing')
    const first = await insertTestGithubFriend(
      account.account_id,
      `old-first-${randomUUID()}`,
      new Date(now.getTime() - 121 * day),
    )
    const second = await insertTestGithubFriend(
      account.account_id,
      `old-second-${randomUUID()}`,
      new Date(now.getTime() - 120 * day),
    )
    const recent = await insertTestGithubFriend(
      account.account_id,
      `recent-${randomUUID()}`,
      new Date(now.getTime() - 10 * day),
    )

    expect(await cleanupSecuritySourcePage('github_friends', 1, now)).toEqual({
      deleted: 1,
      hasMore: true,
    })
    expect(await testGithubFriendExists(first)).toBe(false)
    expect(await testGithubFriendExists(second)).toBe(true)
    expect(await cleanupSecuritySourcePage('github_friends', 1, now)).toEqual({
      deleted: 1,
      hasMore: false,
    })
    expect(await testGithubFriendExists(second)).toBe(false)
    expect(await testGithubFriendExists(recent)).toBe(true)
  })
})
