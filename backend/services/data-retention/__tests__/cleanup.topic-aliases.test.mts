import { describe, expect, it } from 'vitest'
import {
  createRandomString,
  createTestRetentionWindow,
  createTestUserDirect,
  getTestTopicCreatedById,
  getTestUserRaw,
  getTopicAliasIdForTest,
  insertTestTopic,
  insertTopicAliasForTest,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { DELETED_USER_ID } from '@services/users/constants'
import { cleanupSoftDeletedUsers } from '../cleanup.mts'

describe('cleanupSoftDeletedUsers topic aliases', () => {
  it('preserves topics and aliases by reassigning purged creators', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create test user')
    const suffix = createRandomString(8)
    const alias = `purged-topic-${suffix}`
    const topicId = await insertTestTopic({
      name: `Purged topic ${suffix}`,
      slug: alias,
      createdById: user.id,
    })
    await insertTopicAliasForTest(topicId, alias)
    await softDeleteUserAt(user.id, window.firstEligibleDate)

    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(user.id)).toBeNull()
    expect(await getTestTopicCreatedById(topicId)).toBe(DELETED_USER_ID)
    expect(await getTopicAliasIdForTest(alias)).not.toBeNull()
  }, 30_000)
})
