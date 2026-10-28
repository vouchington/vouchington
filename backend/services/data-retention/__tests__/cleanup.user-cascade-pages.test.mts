import { createHash, randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  createTestPost,
  createTestUrlWithHostname,
  insertTestRssFeedItem,
  insertTestCommunity,
  insertTestCommunityMember,
  softDeleteUserAt,
  getTestUserRaw,
  createTestRetentionWindow,
} from '@voucha/test-helpers'
import { createTestRssFeed } from '@voucha/test-helpers/rss-feed-create'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import {
  createTestUserPurgeCascadeRows,
  getTestUserPurgeRemainingRows,
  getTestPurgeCommunity,
} from '@voucha/test-helpers/user-purge-communities'
import { cleanupSoftDeletedUser } from '../cleanup-soft-deleted-user.mts'
import { dataRetentionConfig } from '../config.mts'

describe('mutation-backed final purge pages', () => {
  it('archives ownerless communities and drains removed list children, notifications and memberships before user deletion', async () => {
    const user = await createTestUserDirect()
    const communities = []
    for (let index = 0; index < 2; index++) {
      const community = await insertTestCommunity({ createdById: user.id })
      await insertTestCommunityMember({ communityId: community.id, userId: user.id, role: 'owner' })
      communities.push(community)
    }
    const post = await createTestPost()
    const feed = await createTestRssFeed({})
    const url = await createTestUrlWithHostname()
    const itemId = await insertTestRssFeedItem({
      rssFeedId: feed.id,
      urlId: url,
      guid: randomUUID(),
      itemData: {},
      contentSha256: createHash('sha256').update(randomUUID()).digest(),
    })
    const listId = await createTestUserPurgeCascadeRows(user.id, post.id, itemId)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    const restore = overrideDynamicConfigFieldsForTest(dataRetentionConfig, {
      batch_size: 1,
      community_purge_batch_size: 1,
    })
    try {
      // Fifteen owned work rows are settled one at a time; the sixteenth page may delete the user.
      for (let page = 0; page < 15; page++) {
        const before = await getTestUserPurgeRemainingRows(user.id, listId)
        await expect(
          cleanupSoftDeletedUser(user.id, window.upperBoundDate, undefined, 1),
        ).resolves.toEqual({ deleted: 0, hasMore: true })
        await expect(getTestUserPurgeRemainingRows(user.id, listId)).resolves.toBe(before - 1)
        await expect(getTestUserRaw(user.id)).resolves.not.toBeNull()
      }
      await expect(
        cleanupSoftDeletedUser(user.id, window.upperBoundDate, undefined, 1),
      ).resolves.toEqual({ deleted: 1, hasMore: false })
      await expect(getTestUserRaw(user.id)).resolves.toBeNull()
      for (const community of communities) {
        await expect(getTestPurgeCommunity(community.id)).resolves.toMatchObject({
          id: community.id,
          archived_at: expect.any(Date),
        })
      }
      await expect(
        cleanupSoftDeletedUser(user.id, window.upperBoundDate, undefined, 1),
      ).resolves.toEqual({ deleted: 0, hasMore: false })
    } finally {
      restore()
    }
  })
})
