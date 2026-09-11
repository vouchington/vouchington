import { describe, expect, it } from 'vitest'

import {
  createRandomString,
  createTestTopic,
  createTestUserDirect,
  createTopHashtagAliasForTest,
  createTopHashtagPostSourceForTest,
  getPostHashtagSourceContributorIdsForTest,
  getTestPostPublicationDirtyWorkForScope,
  getTestUserRaw,
  insertTestPost,
  listTestPostPublicationImpactTopicIds,
  createTestRetentionWindow,
  softDeleteUserAt,
} from '@voucha/test-helpers'
import { DELETED_USER_ID } from '@services/users/constants'
import { deleteUserAndDrainForTest } from '@services/users/delete-test-support'
import { cleanupSoftDeletedUsers } from '../cleanup.mts'

describe('cleanupSoftDeletedUsers hashtag source retention', () => {
  it("retains another author's post and topic before reassigning its contributor", async () => {
    const window = createTestRetentionWindow()
    const [owner, contributor] = await Promise.all([createTestUserDirect(), createTestUserDirect()])
    if (!owner || !contributor) throw new Error('Failed to create test users')
    const topic = await createTestTopic()
    const hashtag = `external-${createRandomString(8).toLowerCase()}`
    const topicAliasId = await createTopHashtagAliasForTest(topic.id, hashtag)
    const postId = await insertTestPost({
      title: `External contributor #${hashtag}`,
      slug: `external-contributor-${hashtag}`,
      markdown: `#${hashtag}`,
      createdById: owner.id,
    })
    await createTopHashtagPostSourceForTest({
      postId,
      topicAliasId,
      userId: contributor.id,
      authoredToken: `#${hashtag}`,
    })

    await deleteUserAndDrainForTest(contributor, contributor)
    await softDeleteUserAt(contributor.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)

    const work = await getTestPostPublicationDirtyWorkForScope({ type: 'post', id: postId })
    expect(work?.reasons).toContain('author_deleted')
    await expect(listTestPostPublicationImpactTopicIds(work!.id)).resolves.toContain(topic.id)
    await expect(getPostHashtagSourceContributorIdsForTest(postId)).resolves.toEqual([
      DELETED_USER_ID,
    ])
  }, 60_000)

  it('reassigns hashtag source contributors before hard-deleting users', async () => {
    const window = createTestRetentionWindow()
    const user = await createTestUserDirect()
    if (!user) throw new Error('Failed to create test user')

    const topic = await createTestTopic()
    const hashtag = `purge-${createRandomString(8).toLowerCase()}`
    const topicAliasId = await createTopHashtagAliasForTest(topic.id, hashtag)
    const postId = await insertTestPost({
      title: `Retained hashtag ${hashtag}`,
      slug: `retained-hashtag-${hashtag}`,
      markdown: `#${hashtag}`,
      createdById: user.id,
    })
    await createTopHashtagPostSourceForTest({
      postId,
      topicAliasId,
      userId: user.id,
      authoredToken: `#${hashtag}`,
    })

    await deleteUserAndDrainForTest(user, user)
    await softDeleteUserAt(user.id, window.firstEligibleDate)
    await cleanupSoftDeletedUsers(window)

    expect(await getTestUserRaw(user.id)).toBeNull()
    await expect(getPostHashtagSourceContributorIdsForTest(postId)).resolves.toEqual([
      DELETED_USER_ID,
    ])
  }, 60_000)
})
