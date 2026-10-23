import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import {
  deleteTestOAuthAuthorizationFixtures,
  insertTestGithubFriend,
  insertTestOAuthAccount,
  testGithubFriendExists,
} from '@voucha/test-helpers'
import { cleanupSecuritySourcePage } from './cleanup-security-records.mts'
import { SOURCES } from './security-record-plans.mts'

describe('security record cleanup', () => {
  it('prepares a bounded page for every source with its own typed cursor', async () => {
    // This cutoff predates synthetic records; the query checks every source without deleting
    // fixtures owned by another parallel test.
    const now = new Date('1974-01-02T00:00:00.000Z')
    const pages = await Promise.all(
      SOURCES.map(source => cleanupSecuritySourcePage(source, 1, now)),
    )
    expect(pages).toEqual(SOURCES.map(() => ({ deleted: 0, hasMore: false })))
  })

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
