import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
  countTestPostsCreatedBy,
  createTestPost,
  getTestUserRaw,
  createTestRetentionWindow,
  softDeleteUserAt,
  readTestPublicationIdentityBridge,
  insertTestPostsForUser,
  insertTestPostSourcesForContributor,
  countTestPostSourcesForContributor,
  createTestTopic,
  createTopHashtagAliasForTest,
  createRandomString,
} from '@voucha/test-helpers'
import { cleanupSoftDeletedUsers } from '../cleanup.mts'

describe('author deletion budget', () => {
  it('commits a capped author page and keeps its user until the remaining post preimages are captured', async () => {
    const user = await createTestUserDirect()
    const first = await createTestPost({ user })
    const second = await createTestPost({ user })
    const owner = await createTestUserDirect()
    const contributedPostIds = await insertTestPostsForUser(owner.id, 2)
    const topic = await createTestTopic()
    const aliasId = await createTopHashtagAliasForTest(
      topic.id,
      `cap-${createRandomString(8).toLowerCase()}`,
    )
    await insertTestPostSourcesForContributor(contributedPostIds, aliasId, user.id)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    const options = { ...window, batchSize: 1, maxBatches: 1 }
    await expect(cleanupSoftDeletedUsers(options)).resolves.toEqual({ deleted: 0, hasMore: true })
    expect(await getTestUserRaw(user.id)).not.toBeNull()
    await expect(countTestPostSourcesForContributor(user.id)).resolves.toBe(1)
    await cleanupSoftDeletedUsers(options)
    await expect(countTestPostSourcesForContributor(user.id)).resolves.toBe(0)
    await cleanupSoftDeletedUsers(options)
    await cleanupSoftDeletedUsers(options)
    await cleanupSoftDeletedUsers(options)
    expect(await getTestUserRaw(user.id)).toBeNull()
    expect(await readTestPublicationIdentityBridge('post', first.id)).not.toBeNull()
    expect(await readTestPublicationIdentityBridge('post', second.id)).not.toBeNull()
  })
  it('shares the row allowance across selected authors instead of giving each a full page', async () => {
    const first = await createTestUserDirect()
    const second = await createTestUserDirect()
    await insertTestPostsForUser(first.id, 2)
    await insertTestPostsForUser(second.id, 2)
    const window = createTestRetentionWindow()
    await softDeleteUserAt(first.id, window.firstEligibleDate)
    await softDeleteUserAt(second.id, window.secondEligibleDate)
    const options = { ...window, batchSize: 2, maxBatches: 1 }
    await expect(cleanupSoftDeletedUsers(options)).resolves.toEqual({ deleted: 0, hasMore: true })
    expect(await countTestPostsCreatedBy(first.id)).toBe(0)
    expect(await countTestPostsCreatedBy(second.id)).toBe(2)
    expect(await getTestUserRaw(first.id)).not.toBeNull()
    await cleanupSoftDeletedUsers(options)
    expect(await countTestPostsCreatedBy(second.id)).toBe(1)
    expect(await getTestUserRaw(first.id)).toBeNull()
  })
})
