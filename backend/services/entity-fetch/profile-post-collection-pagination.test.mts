import { describe, expect, it } from 'vitest'
import { decodeScopedTimestampUuidCursor, encodeCursor } from '@modules/pagination'
import {
  createTestUser,
  insertEntityRelation,
  insertTestCommunity,
  insertTestCommunityMember,
  insertTestCommunityPostReview,
  insertTestPendingCommunityPostReview,
  insertTestPost,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { getUserPostCollectionCursorScope, getUserPostsCollection } from './profile-collections.mts'

describe('private post collection pagination', () => {
  it('returns canonical page info for empty, partial, and exact-limit collections', async () => {
    const emptyOwner = await createTestUser()
    const partialOwner = await createTestUser()
    const exactOwner = await createTestUser()
    if (!emptyOwner || !partialOwner || !exactOwner) throw new Error('Failed to create test users')

    const empty = await getUserPostsCollection(emptyOwner, emptyOwner.id, 'saved', { limit: 2 })
    expect(empty).toEqual({
      results: [],
      page_info: { has_next_page: false, start_cursor: null, end_cursor: null },
    })

    const partialPost = await insertVisibleSavedPost(partialOwner.id, 'partial', 0)
    const partial = await getUserPostsCollection(partialOwner, partialOwner.id, 'saved', {
      limit: 2,
    })
    expect(partial.results.map(post => post.id)).toEqual([partialPost])
    expect(partial.page_info.has_next_page).toBe(false)
    expect(partial.page_info.start_cursor).toEqual(expect.any(String))
    expect(partial.page_info.end_cursor).toBeNull()

    await insertVisibleSavedPost(exactOwner.id, 'exact-newer', 1)
    await insertVisibleSavedPost(exactOwner.id, 'exact-older', 0)
    const exact = await getUserPostsCollection(exactOwner, exactOwner.id, 'saved', { limit: 2 })
    expect(exact.results).toHaveLength(2)
    expect(exact.page_info.has_next_page).toBe(false)
    expect(exact.page_info.start_cursor).toEqual(expect.any(String))
    expect(exact.page_info.end_cursor).toBeNull()
  })

  it('skips a newest comment whose root is inaccessible before applying limit', async () => {
    const owner = await createTestUser()
    const creator = await createTestUser()
    if (!owner || !creator) throw new Error('Failed to create test users')
    const visibleId = await insertVisibleSavedPost(owner.id, 'comment-visible', 0)
    const rootId = await insertTestPost({
      title: `Private root ${owner.id}`,
      slug: `private-root-${owner.id}`,
      markdown: 'private root',
      createdById: creator.id,
      privacy: 'private',
      broadcast: 'followers',
    })
    const commentId = await insertTestPost({
      title: `Inaccessible comment ${owner.id}`,
      slug: `inaccessible-comment-${owner.id}`,
      markdown: 'comment',
      createdById: owner.id,
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    await insertSavedRelationAt(owner.id, commentId, 1)

    const collection = await getUserPostsCollection(owner, owner.id, 'saved', { limit: 1 })

    expect(collection.results.map(post => post.id)).toEqual([visibleId])
    expect(collection.page_info.has_next_page).toBe(false)
  })

  it('skips a newest private-community post for a nonmember before applying limit', async () => {
    const owner = await createTestUser()
    const creator = await createTestUser()
    if (!owner || !creator) throw new Error('Failed to create test users')
    const visibleId = await insertVisibleSavedPost(owner.id, 'private-community-visible', 0)
    const community = await insertTestCommunity({
      createdById: creator.id,
      visibility: 'private',
    })
    const hiddenId = await insertTestPost({
      title: `Private community ${owner.id}`,
      slug: `private-community-${owner.id}`,
      markdown: 'private community',
      createdById: creator.id,
      communityId: community.id,
    })
    await insertTestCommunityPostReview({
      communityId: community.id,
      postId: hiddenId,
      submittedById: creator.id,
    })
    await insertSavedRelationAt(owner.id, hiddenId, 1)

    const collection = await getUserPostsCollection(owner, owner.id, 'saved', { limit: 1 })

    expect(collection.results.map(post => post.id)).toEqual([visibleId])
    expect(collection.page_info.has_next_page).toBe(false)
  })

  it('skips a newest unapproved community post before applying limit', async () => {
    const owner = await createTestUser()
    const creator = await createTestUser()
    if (!owner || !creator) throw new Error('Failed to create test users')
    const visibleId = await insertVisibleSavedPost(owner.id, 'pending-community-visible', 0)
    const community = await insertTestCommunity({ createdById: creator.id, visibility: 'public' })
    await insertTestCommunityMember({ communityId: community.id, userId: owner.id })
    const hiddenId = await insertTestPost({
      title: `Pending community ${owner.id}`,
      slug: `pending-community-${owner.id}`,
      markdown: 'pending community',
      createdById: creator.id,
      communityId: community.id,
    })
    await insertTestPendingCommunityPostReview({
      communityId: community.id,
      postId: hiddenId,
      submittedById: creator.id,
    })
    await insertSavedRelationAt(owner.id, hiddenId, 1)

    const collection = await getUserPostsCollection(owner, owner.id, 'saved', { limit: 1 })

    expect(collection.results.map(post => post.id)).toEqual([visibleId])
    expect(collection.page_info.has_next_page).toBe(false)
  })
  it.each([
    ['saved', 'relation__user__save__post'],
    ['hidden', 'relation__user__hide__post'],
    ['following', 'relation__user__follow__post'],
    ['subscribed', 'relation__user__subscribe__post'],
  ] as const)('paginates the %s relation mapping', async (listType, tableName) => {
    const owner = await createTestUser()
    if (!owner) throw new Error('Failed to create test user')
    const postId = await insertTestPost({
      title: `${listType} post ${owner.id}`,
      slug: `${listType}-post-${owner.id}`,
      markdown: listType,
      createdById: owner.id,
    })
    await insertEntityRelation(tableName, owner.id, postId)

    const collection = await getUserPostsCollection(owner, owner.id, listType, { limit: 1 })

    expect(collection.results.map(post => post.id)).toEqual([postId])
  })

  it('applies visibility before the page limit', async () => {
    const owner = await createTestUser()
    if (!owner) throw new Error('Failed to create test user')
    const visibleId = await insertTestPost({
      title: `Visible ${owner.id}`,
      slug: `visible-${owner.id}`,
      markdown: 'visible',
      createdById: owner.id,
    })
    const blockedId = await insertTestPost({
      createdById: owner.id,
      postType: 'topic_recommendation',
      title: `Blocked ${owner.id}`,
      slug: `blocked-${owner.id}`,
      markdown: 'blocked',
    })
    await insertEntityRelation('relation__user__save__post', owner.id, visibleId)
    await insertEntityRelation('relation__user__save__post', owner.id, blockedId)

    const collection = await getUserPostsCollection(owner, owner.id, 'saved', { limit: 1 })

    expect(collection.results.map(post => post.id)).toEqual([visibleId])
    expect(collection.page_info.has_next_page).toBe(false)
  })

  it('continues with a scoped timestamp cursor without gaps or duplicates', async () => {
    const owner = await createTestUser()
    if (!owner) throw new Error('Failed to create test user')
    const postIds = await Promise.all(
      Array.from({ length: 3 }, (_, index) =>
        insertTestPost({
          title: `Page post ${owner.id} ${index}`,
          slug: `page-post-${owner.id}-${index}`,
          markdown: 'page',
          createdById: owner.id,
        }),
      ),
    )
    for (const postId of postIds) {
      await insertEntityRelation('relation__user__save__post', owner.id, postId)
    }

    const first = await getUserPostsCollection(owner, owner.id, 'saved', { limit: 2 })
    const second = await getUserPostsCollection(owner, owner.id, 'saved', {
      limit: 2,
      after: first.page_info.end_cursor!,
    })

    expect(first.page_info.has_next_page).toBe(true)
    expect(second.page_info.has_next_page).toBe(false)
    expect(new Set([...first.results, ...second.results].map(post => post.id))).toEqual(
      new Set(postIds),
    )
  })

  it('rejects cursors from another owner or list', () => {
    const ownerId = '019d0000-0000-7000-8000-000000000001'
    const otherOwnerId = '019d0000-0000-7000-8000-000000000002'
    const cursor = encodeCursor({
      timestamp: 1_700_000_000,
      id: '019d0000-0000-7000-8000-000000000003',
      scope: getUserPostCollectionCursorScope(ownerId, 'saved'),
    })

    expect(() =>
      decodeScopedTimestampUuidCursor(
        cursor,
        getUserPostCollectionCursorScope(otherOwnerId, 'saved'),
        'Invalid private post collection cursor',
      ),
    ).toThrow('Invalid private post collection cursor')
    expect(() =>
      decodeScopedTimestampUuidCursor(
        cursor,
        getUserPostCollectionCursorScope(ownerId, 'hidden'),
        'Invalid private post collection cursor',
      ),
    ).toThrow('Invalid private post collection cursor')
  })

  it('uses the relation UUID to break tied timestamps deterministically', async () => {
    const owner = await createTestUser()
    if (!owner) throw new Error('Failed to create test user')
    const postIds = await Promise.all(
      Array.from({ length: 2 }, (_, index) =>
        insertTestPost({
          title: `Tied post ${owner.id} ${index}`,
          slug: `tied-post-${owner.id}-${index}`,
          markdown: 'tie',
          createdById: owner.id,
        }),
      ),
    )
    const createdAt = new Date('2026-07-18T12:00:00.000Z')
    for (const postId of postIds) {
      await insertEntityRelation('relation__user__save__post', owner.id, postId)
      await updateTestEntityRelationCreatedAt(
        'relation__user__save__post',
        owner.id,
        postId,
        createdAt,
      )
    }

    const first = await getUserPostsCollection(owner, owner.id, 'saved', { limit: 1 })
    const second = await getUserPostsCollection(owner, owner.id, 'saved', {
      limit: 1,
      after: first.page_info.end_cursor!,
    })

    expect(first.results[0]?.id).toBe([...postIds].sort().reverse()[0])
    expect(second.results[0]?.id).toBe([...postIds].sort().reverse()[1])
  })
})

async function insertVisibleSavedPost(
  ownerId: string,
  label: string,
  order: number,
): Promise<string> {
  const postId = await insertTestPost({
    title: `${label} ${ownerId}`,
    slug: `${label}-${ownerId}`,
    markdown: label,
    createdById: ownerId,
  })
  await insertSavedRelationAt(ownerId, postId, order)
  return postId
}

async function insertSavedRelationAt(
  ownerId: string,
  postId: string,
  order: number,
): Promise<void> {
  await insertEntityRelation('relation__user__save__post', ownerId, postId)
  await updateTestEntityRelationCreatedAt(
    'relation__user__save__post',
    ownerId,
    postId,
    new Date(Date.UTC(2026, 6, 18, 12, 0, order)),
  )
}
