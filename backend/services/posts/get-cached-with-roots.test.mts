import { describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { caches } from '@services/entity-cache/caches'
import { getPostsByAnyBatch } from '@services/posts/get-batch'
import { updatePost } from '@services/posts/update'
import { getPostsWithRootsByAnyCached } from './get-cached-with-roots.mts'

describe('getPostsWithRootsByAnyCached', () => {
  it('invalidates warmed slug and id entries after a canonical post update', async () => {
    const user = await createTestUser({ administrator: true })
    const slug = `root-cache-before-${randomUUID()}`
    const id = await insertTestPost({
      createdById: user.id,
      title: 'Before update',
      slug,
      markdown: 'Original content',
    })
    const {
      posts: [post],
    } = await getPostsWithRootsByAnyCached([slug])
    if (!post) throw new Error('Expected created post')
    await caches.posts.setBatch([
      { key: slug, value: post },
      { key: id, value: post },
    ])
    const nextSlug = `root-cache-after-${randomUUID()}`
    await updatePost(user, post, { title: 'After update', slug: nextSlug })
    const result = await getPostsWithRootsByAnyCached([slug, id, nextSlug])
    for (const current of result.posts) {
      expect(current).toMatchObject({ id, title: 'After update', slug: nextSlug })
    }
  })
  it('loads cold posts and shared roots while preserving duplicates', async () => {
    const user = await createTestUser()
    const rootId = await insertTestPost({
      createdById: user.id,
      title: 'Cold root',
      slug: `cold-root-${randomUUID()}`,
      markdown: 'Root content',
    })
    const commentSlug = `cold-comment-${randomUUID()}`
    const commentId = await insertTestPost({
      createdById: user.id,
      postType: 'comment',
      rootId,
      parentId: rootId,
      title: 'Cold comment',
      slug: commentSlug,
      markdown: 'Comment content',
    })
    const result = await getPostsWithRootsByAnyCached([commentSlug, commentId])
    expect(result.posts.map(post => post?.id)).toEqual([commentId, commentId])
    expect(result.roots.map(post => post?.id)).toEqual([rootId])
  })

  it('combines misses with roots discovered from cache hits and preserves negative hits', async () => {
    const user = await createTestUser()
    const cachedRootId = await insertTestPost({
      createdById: user.id,
      title: 'Cached root',
      slug: `cached-root-${randomUUID()}`,
      markdown: 'Root content',
    })
    const coldRootId = await insertTestPost({
      createdById: user.id,
      title: 'Cold root',
      slug: `cold-root-${randomUUID()}`,
      markdown: 'Root content',
    })
    const cachedCommentId = await insertTestPost({
      createdById: user.id,
      postType: 'comment',
      rootId: cachedRootId,
      parentId: cachedRootId,
      title: 'Cached comment',
      slug: `cached-comment-${randomUUID()}`,
      markdown: 'Comment content',
    })
    const coldCommentId = await insertTestPost({
      createdById: user.id,
      postType: 'comment',
      rootId: coldRootId,
      parentId: coldRootId,
      title: 'Cold comment',
      slug: `cold-comment-${randomUUID()}`,
      markdown: 'Comment content',
    })
    const [cachedPost] = await getPostsByAnyBatch([cachedCommentId])
    const missingId = randomUUID()
    await caches.posts.setBatch([
      { key: cachedCommentId, value: cachedPost },
      { key: missingId, value: null },
    ])
    const ids = [cachedCommentId, coldCommentId, missingId]
    const result = await getPostsWithRootsByAnyCached(ids)
    expect(result.posts.map(post => post?.id ?? null)).toEqual([
      cachedCommentId,
      coldCommentId,
      null,
    ])
    expect(result.roots.map(post => post?.id)).toEqual([cachedRootId, coldRootId])

    await caches.posts.setBatch(
      [...result.posts, ...result.roots].flatMap(post =>
        post ? [{ key: post.id, value: post }] : [],
      ),
    )
    const warm = await getPostsWithRootsByAnyCached(ids)
    expect(JSON.parse(JSON.stringify(warm))).toEqual(JSON.parse(JSON.stringify(result)))
    await caches.posts.delete(cachedRootId, coldRootId)
    const rootsExpired = await getPostsWithRootsByAnyCached(ids)
    expect(JSON.parse(JSON.stringify(rootsExpired))).toEqual(JSON.parse(JSON.stringify(result)))
  })
})
