import { it, expect, describe } from 'vitest'
import { bookmarkEntity } from './upsert.mts'
import { getBookmarkMapsForEntityGroups } from './get.mts'
import {
  backfillUserBookmarkBloomFilter,
  getUserBookmarkRelationsForEntityType,
} from './bloom-filter.mts'
import { getBookmarkBloomReadyKey } from './bloom-filter-utils.mts'
import { registerBookmarkBloomFixture } from '@voucha/test-helpers/bookmark-bloom-fixture'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { bloomValkeyClient } from '@data-stores/valkey'

describe('grouped bookmark reads with bloom filtering', () => {
  const fixture = registerBookmarkBloomFixture()

  it('keeps empty groups when ready filters reject every candidate', async () => {
    await backfillUserBookmarkBloomFilter(fixture.user.id)
    const missingPostId = '00000000-0000-7000-8000-000000000001'
    const missingUserId = '00000000-0000-7000-8000-000000000002'

    const grouped = await getBookmarkMapsForEntityGroups(fixture.user, [
      { entityTypeName: 'topic', entities: [] },
      { entityTypeName: 'post', entities: [missingPostId] },
      { entityTypeName: 'user', entities: [missingUserId] },
    ])

    expect(grouped).toEqual([{}, {}, {}])
  })

  it('returns separate post and creator maps while their bloom relations are unready', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const creator = await createTestUser()
    const postId = await insertTestPost({
      createdById: creator.id,
      slug: `grouped-bloom-unready-${random}`,
      title: `Grouped bloom unready ${random}`,
      markdown: 'Test post',
    })
    await bookmarkEntity(fixture.user, 'post', { id: postId }, 'save')
    await bookmarkEntity(fixture.user, 'user', { id: creator.id }, 'follow')

    const [postBookmarks, creatorBookmarks] = await getBookmarkMapsForEntityGroups(fixture.user, [
      { entityTypeName: 'post', entities: [postId, creator.id] },
      { entityTypeName: 'user', entities: [creator.id, postId] },
    ])

    expect(postBookmarks).toEqual({ [postId]: { save: true } })
    expect(creatorBookmarks).toEqual({ [creator.id]: { follow: true } })
  })

  it('returns separate post and creator maps after the bloom relations are ready', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const creator = await createTestUser()
    const postId = await insertTestPost({
      createdById: creator.id,
      slug: `grouped-bloom-ready-${random}`,
      title: `Grouped bloom ready ${random}`,
      markdown: 'Test post',
    })
    await bookmarkEntity(fixture.user, 'post', { id: postId }, 'save')
    await bookmarkEntity(fixture.user, 'user', { id: creator.id }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    const [postBookmarks, creatorBookmarks] = await getBookmarkMapsForEntityGroups(fixture.user, [
      { entityTypeName: 'post', entities: [postId, creator.id] },
      { entityTypeName: 'user', entities: [creator.id, postId] },
    ])

    expect(postBookmarks).toEqual({ [postId]: { save: true } })
    expect(creatorBookmarks).toEqual({ [creator.id]: { follow: true } })
  })

  it('keeps bookmarks visible when one grouped relation is unready', async () => {
    const random = Math.random().toString(36).slice(2, 12)
    const creator = await createTestUser()
    const postId = await insertTestPost({
      createdById: creator.id,
      slug: `grouped-bloom-partial-${random}`,
      title: `Grouped bloom partial ${random}`,
      markdown: 'Test post',
    })
    await bookmarkEntity(fixture.user, 'post', { id: postId }, 'save')
    await bookmarkEntity(fixture.user, 'user', { id: creator.id }, 'follow')
    await backfillUserBookmarkBloomFilter(fixture.user.id)

    const postSaveRelation = getUserBookmarkRelationsForEntityType('post').find(
      relation => relation.predicate === 'save',
    )
    if (!postSaveRelation) throw new Error('Missing post save bookmark relation')
    await bloomValkeyClient.unlink([
      getBookmarkBloomReadyKey(fixture.user.id, postSaveRelation.table_name),
    ])

    const [postBookmarks, creatorBookmarks] = await getBookmarkMapsForEntityGroups(fixture.user, [
      { entityTypeName: 'post', entities: [postId, creator.id] },
      { entityTypeName: 'user', entities: [creator.id, postId] },
    ])

    expect(postBookmarks).toEqual({ [postId]: { save: true } })
    expect(creatorBookmarks).toEqual({ [creator.id]: { follow: true } })
  })
})
