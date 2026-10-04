import { describe, expect, it } from 'vitest'
import {
  createTestUserDirect,
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
})
