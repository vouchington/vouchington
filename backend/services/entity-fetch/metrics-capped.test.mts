import { randomUUID } from 'node:crypto'
import { describe, expect, it, onTestFinished } from 'vitest'
import { profileCountConfig } from '@services/users/profile-count-cap'
import { upsertRecentlyViewed } from '@services/recently-viewed'
import {
  createTestPost,
  createTestTopic,
  createTestUser,
  insertEntityRelation,
} from '@voucha/test-helpers'
import { overrideDynamicConfigFieldsForTest } from '@voucha/test-helpers/dynamic-config'
import { updateUserFields } from '@services/users/update-fields'
import { getUserProfileMetricsByAny } from './metrics.mts'

describe('capped profile metrics', () => {
  it('caps private and bookmark counts and hides private counts and flags from strangers', async () => {
    await profileCountConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(profileCountConfig, { count_cap: 1 }))
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const first = await createTestTopic({ name: `Count ${randomUUID()}` })
    const second = await createTestTopic({ name: `Count ${randomUUID()}` })
    await insertEntityRelation('relation__user__block__topic', owner.id, first.id)
    const atCap = await getUserProfileMetricsByAny(owner.id, { currentUser: owner })
    expect(atCap?.private_count?.topics_blocked).toBe(1)
    expect(atCap?.private_count_capped?.topics_blocked).toBe(false)
    await insertEntityRelation('relation__user__block__topic', owner.id, second.id)
    await insertEntityRelation('relation__user__follow__topic', owner.id, first.id)
    await insertEntityRelation('relation__user__follow__topic', owner.id, second.id)
    await upsertRecentlyViewed('topic', first.id, null, owner.id)
    await upsertRecentlyViewed('topic', second.id, null, owner.id)

    const own = await getUserProfileMetricsByAny(owner.id, { currentUser: owner })
    expect(own?.private_count).toMatchObject({
      topics_blocked: 1,
      topics_viewed: 1,
      topics_muted: 0,
    })
    expect(own?.private_count_capped).toMatchObject({
      topics_blocked: true,
      topics_viewed: true,
      topics_muted: false,
    })
    expect(own?.bookmarks.follow.topics).toBe(1)
    expect(own?.bookmarks_capped.follow.topics).toBe(true)
    expect(own?.count_capped.topics_following).toBe(true)
    const other = await getUserProfileMetricsByAny(owner.id, { currentUser: stranger })
    expect(other?.private_count).toBeUndefined()
    expect(other?.private_count_capped).toBeUndefined()
  })

  it('caps incoming followers for the owner and hides the count and flag from strangers', async () => {
    await profileCountConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(profileCountConfig, { count_cap: 1 }))
    const owner = await createTestUser()
    const firstFollower = await createTestUser()
    const secondFollower = await createTestUser()
    const stranger = await createTestUser()
    await insertEntityRelation('relation__user__follow__user', firstFollower.id, owner.id)
    await insertEntityRelation('relation__user__follow__user', secondFollower.id, owner.id)
    await updateUserFields(owner.id, { followers_visibility: 'nobody' })

    const own = await getUserProfileMetricsByAny(owner.id, { currentUser: owner })
    expect(own?.bookmarkers.follow).toBe(1)
    expect(own?.bookmarkers_capped.follow).toBe(true)
    expect(own?.count.users_followers).toBe(1)
    expect(own?.count_capped.users_followers).toBe(true)

    const other = await getUserProfileMetricsByAny(owner.id, { currentUser: stranger })
    expect(other?.bookmarkers.follow).toBe(0)
    expect(other?.bookmarkers_capped.follow).toBe(false)
    expect(other?.count.users_followers).toBe(0)
    expect(other?.count_capped.users_followers).toBe(false)
  })

  it('caps owner-only followed posts and hides the count and flag from strangers', async () => {
    await profileCountConfig.waitForInitialization()
    onTestFinished(overrideDynamicConfigFieldsForTest(profileCountConfig, { count_cap: 1 }))
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const firstPost = await createTestPost({ user: stranger })
    const secondPost = await createTestPost({ user: stranger })
    await insertEntityRelation('relation__user__follow__post', owner.id, firstPost.id)
    await insertEntityRelation('relation__user__follow__post', owner.id, secondPost.id)

    const own = await getUserProfileMetricsByAny(owner.id, { currentUser: owner })
    expect(own?.bookmarks.follow.posts).toBe(1)
    expect(own?.bookmarks_capped.follow.posts).toBe(true)

    const other = await getUserProfileMetricsByAny(owner.id, { currentUser: stranger })
    expect(other?.bookmarks.follow.posts).toBe(0)
    expect(other?.bookmarks_capped.follow.posts).toBe(false)
  })
})
