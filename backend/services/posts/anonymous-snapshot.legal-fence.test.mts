import { describe, expect, it } from 'vitest'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { getPostIdsCached } from '../entity-fetch/search-caches.mts'
import { getAnonymousCacheGeneration } from '@services/entity-cache/anonymous-cache-generation'
import { deleteUser } from '@services/users/delete'
import { getPostByAny } from './get.mts'
import {
  getAnonymousPostRowsByIdsCached,
  getAnonymousPostSnapshotByAnyCached,
} from './anonymous-snapshot.mts'

describe('anonymous post cache legal deletion fence', () => {
  it('excludes the deleted author before post reassignment from cold snapshots and list fills', async () => {
    const author = await createTestUser()
    const otherAuthor = await createTestUser()
    const ownPostId = await insertTestPost({
      title: 'Deletion fence public post',
      slug: `deletion-fence-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Public body before deletion',
    })
    const otherRootId = await insertTestPost({
      title: 'Other author root',
      slug: `other-root-${crypto.randomUUID()}`,
      createdById: otherAuthor.id,
      markdown: 'Other root body',
    })
    const commentId = await insertTestPost({
      title: '',
      slug: `deleted-author-comment-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Comment before deletion',
      postType: 'comment',
      rootId: otherRootId,
      parentId: otherRootId,
    })
    const options = { user_id: author.id, post_types: ['discussion' as const] }
    expect((await getPostIdsCached(options)).results.map(row => row.id)).toContain(ownPostId)
    expect((await getAnonymousPostSnapshotByAnyCached(ownPostId)).post?.id).toBe(ownPostId)
    expect((await getAnonymousPostSnapshotByAnyCached(commentId)).post?.id).toBe(commentId)
    const before = await getAnonymousCacheGeneration()

    await deleteUser(author, author)
    expect(await getAnonymousCacheGeneration()).not.toBe(before)
    // The deletion worker has not reassigned the author's posts yet.
    expect((await getPostByAny(ownPostId))?.created_by_id).toBe(author.id)
    expect((await getPostByAny(commentId))?.created_by_id).toBe(author.id)

    expect((await getAnonymousPostSnapshotByAnyCached(ownPostId)).post).toBeNull()
    expect((await getAnonymousPostSnapshotByAnyCached(commentId)).post).toBeNull()
    expect((await getAnonymousPostRowsByIdsCached([commentId], 'direct-body'))[0]?.post).toBeNull()
    expect((await getPostIdsCached(options)).results.map(row => row.id)).not.toContain(ownPostId)
  })
})
