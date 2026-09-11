import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { insertTestCommunity } from '@voucha/test-helpers/entities/communities'
import { insertTestList } from '@voucha/test-helpers/entities/lists'
import { insertTestStory } from '@voucha/test-helpers/entities/stories'
import { getCommunityCacheKeys, getListCacheKeys, getStoryCacheKeys } from '../keys.mts'
import { invalidate } from '../invalidate.mts'

describe('entity cache invalidation tag enqueueing', () => {
  it('resolves community purge keys for both id and slug lookups', async () => {
    const user = await createTestUser()
    const community = await insertTestCommunity({ createdById: user.id })

    await expect(getCommunityCacheKeys(community)).resolves.toEqual(
      expect.arrayContaining([community.id, community.slug]),
    )
    await expect(invalidate.communities(community)).resolves.toBeUndefined()
  })

  it('resolves a list purge key for list invalidation', async () => {
    const user = await createTestUser()
    const list = await insertTestList({ ownerUserId: user.id, name: 'List cache test' })

    await expect(getListCacheKeys(list.id)).resolves.toEqual([list.id])
    await expect(invalidate.lists(list.id)).resolves.toBeUndefined()
  })

  it('resolves a story purge key for story invalidation', async () => {
    const story = await insertTestStory({ title: 'Story cache test' })

    await expect(getStoryCacheKeys(story.id)).resolves.toEqual([story.id])
    await expect(invalidate.stories(story.id)).resolves.toBeUndefined()
  })

  it('resolves sitemap and html coarse invalidation groups without throwing', async () => {
    await expect(invalidate.sitemaps()).resolves.toBeUndefined()
    await expect(invalidate.html()).resolves.toBeUndefined()
  })
})
