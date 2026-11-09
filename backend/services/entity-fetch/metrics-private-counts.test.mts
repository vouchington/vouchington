import { describe, expect, it, onTestFinished } from 'vitest'
import {
  createTestUser,
  insertEntityRelation,
  insertTestPost,
  markTestPostDeletedBy,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { profileCountConfig } from '@services/users/profile-count-cap'
import { getPrivateCounts } from './metrics-private-counts.mts'

async function insertSavedPost(ownerId: string, label: string): Promise<string> {
  const postId = await insertTestPost({
    createdById: ownerId,
    postType: 'discussion',
    title: `Private count target ${label}`,
    slug: `private-count-${label}-${ownerId}`,
    markdown: 'A post saved by its owner for the private count query.',
  })
  await insertEntityRelation('relation__user__save__post', ownerId, postId)
  return postId
}

describe('getPrivateCounts', () => {
  it('counts only live saved posts through the keyed target lookup', async () => {
    const owner = await createTestUser()
    const postId = await insertSavedPost(owner.id, 'a')

    const live = await getPrivateCounts(owner.id, {})
    expect(live.private_count.posts_saved).toBe(1)
    expect(live.private_count_capped.posts_saved).toBe(false)

    await markTestPostDeletedBy(postId, owner.id)
    expect((await getPrivateCounts(owner.id, {})).private_count.posts_saved).toBe(0)
  })

  it('reports the cap and a capped flag when saved posts exceed the cap', async () => {
    await profileCountConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(profileCountConfig, { count_cap: 1 }))
    const owner = await createTestUser()
    await insertSavedPost(owner.id, 'a')
    await insertSavedPost(owner.id, 'b')

    const { private_count, private_count_capped } = await getPrivateCounts(owner.id, {})

    expect(private_count.posts_saved).toBe(1)
    expect(private_count_capped.posts_saved).toBe(true)
    expect(private_count_capped.posts_hidden).toBe(false)
  })
})
