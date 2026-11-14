import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, insertTestPost } from '@voucha/test-helpers'
import { makeTestPostPrivate, setTestPostMarkdown } from '@voucha/test-helpers/post-write-context'
import { caches } from '@services/entity-cache/caches'
import { getPostByAnyCached } from '@services/posts/get-cached'
import { getAnonymousCacheGeneration } from '@services/entity-cache/anonymous-cache-generation'
import {
  countCapturedQueriesByAnnotation,
  enableQueryCapture,
  stopTestQueryCapture,
} from '@voucha/test-helpers/query-capture'

describe('anonymous post detail cache access', () => {
  it('serves a warm public post without a live access query and keeps private posts restricted', async () => {
    const author = await createTestUser()
    const stranger = await createTestUser()
    const publicId = await insertTestPost({
      title: 'Cached public detail',
      slug: `cached-public-detail-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Public detail body',
      broadcast: 'everyone',
      privacy: 'public',
    })
    const privateId = await insertTestPost({
      title: 'Restricted detail',
      slug: `restricted-detail-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Private detail body',
      broadcast: 'followers',
      privacy: 'private',
    })

    const anonymous = createRequest()
    await anonymous.get(`/api/v1/posts/${publicId}`).expect(200)
    enableQueryCapture()
    let queries: ReturnType<typeof stopTestQueryCapture>
    let observedPostId: string | undefined
    try {
      const response = await anonymous.get(`/api/v1/posts/${publicId}`).expect(200)
      observedPostId = response.body.post.id as string
    } finally {
      queries = stopTestQueryCapture()
    }
    expect(observedPostId).toBe(publicId)
    expect(
      countCapturedQueriesByAnnotation(
        queries.filter(query => JSON.stringify(query.values).includes(publicId)),
        'canViewPostsBatch',
      ),
    ).toBe(0)

    await anonymous.get(`/api/v1/posts/${privateId}`).expect(404)
    const unrelated = createRequest()
    await unrelated.authenticateAs(stranger)
    await unrelated.get(`/api/v1/posts/${privateId}`).expect(404)
    const owner = createRequest()
    await owner.authenticateAs(author)
    await owner.get(`/api/v1/posts/${privateId}`).expect(200)
  })

  it('keeps a cached anonymous body coherent when the raw post cache refreshes', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: 'Public snapshot body',
      slug: `public-snapshot-body-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Public snapshot text',
    })
    const anonymous = createRequest()
    const generation = await getAnonymousCacheGeneration()
    await anonymous.get(`/api/v1/posts/${postId}`).expect(200)

    await makeTestPostPrivate(postId)
    await setTestPostMarkdown(postId, 'New private body')
    await caches.posts.invalidateCacheGetByAny(postId)
    expect((await getPostByAnyCached(postId))?.privacy).toBe('private')

    const response = await anonymous.get(`/api/v1/posts/${postId}`)
    const stableGeneration = generation === (await getAnonymousCacheGeneration())
    expect(stableGeneration ? [200] : [200, 404]).toContain(response.status)
    expect(response.body.post?.markdown).not.toBe('New private body')
    const oldPublic = expect.objectContaining({
      id: postId,
      privacy: 'public',
      markdown: 'Public snapshot text',
    })
    expect(response.body.post ?? null).toEqual(response.status === 200 ? oldPublic : null)
  })

  it('never combines a cached public list ID with a refreshed private post body', async () => {
    const author = await createTestUser()
    const postId = await insertTestPost({
      title: 'Public list snapshot',
      slug: `public-list-snapshot-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Previously public body',
    })
    const path = `/api/v1/posts?creator=${author.id}`
    const anonymous = createRequest()
    const first = await anonymous.get(path).expect(200)
    expect(first.body.posts[postId]?.markdown).toBe('Previously public body')

    enableQueryCapture()
    let queries: ReturnType<typeof stopTestQueryCapture>
    try {
      const warm = await anonymous.get(path).expect(200)
      expect(warm.body.posts[postId]?.markdown).toBe('Previously public body')
    } finally {
      queries = stopTestQueryCapture()
    }
    expect(countCapturedQueriesByAnnotation(queries, 'getPublicPostIds')).toBe(0)

    await makeTestPostPrivate(postId)
    await setTestPostMarkdown(postId, 'New private body')
    await caches.posts.invalidateCacheGetByAny(postId)
    expect((await getPostByAnyCached(postId))?.privacy).toBe('private')
    const after = await anonymous.get(path).expect(200)
    expect(after.body.posts[postId]?.privacy).not.toBe('private')
    expect(after.body.posts[postId]?.markdown).not.toBe('New private body')
  })

  it('uses cached root and page access for warm anonymous comment reads', async () => {
    const author = await createTestUser()
    const rootId = await insertTestPost({
      title: 'Cached comment root',
      slug: `cached-comment-root-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Root body',
    })
    const commentId = await insertTestPost({
      title: '',
      slug: `cached-comment-${crypto.randomUUID()}`,
      createdById: author.id,
      markdown: 'Public comment body',
      postType: 'comment',
      rootId,
      parentId: rootId,
    })
    const anonymous = createRequest()
    const ancestorsPath = `/api/v1/posts/${commentId}/ancestors`
    const descendantsPath = `/api/v1/posts/${rootId}/descendants`
    expect((await anonymous.get(ancestorsPath).expect(200)).body.posts[commentId].markdown).toBe(
      'Public comment body',
    )
    expect((await anonymous.get(descendantsPath).expect(200)).body.posts[commentId].markdown).toBe(
      'Public comment body',
    )
    const generation = await getAnonymousCacheGeneration()
    enableQueryCapture()
    let queries: ReturnType<typeof stopTestQueryCapture>
    try {
      const ancestors = await anonymous.get(ancestorsPath).expect(200)
      const descendants = await anonymous.get(descendantsPath).expect(200)
      expect(ancestors.body.posts[commentId].markdown).toBe('Public comment body')
      expect(descendants.body.posts[commentId].markdown).toBe('Public comment body')
    } finally {
      queries = stopTestQueryCapture()
    }
    expect(countCapturedQueriesByAnnotation(queries, 'canViewPostsBatch')).toBe(0)
    const stableGeneration = generation === (await getAnonymousCacheGeneration())
    const descendantHeadQueries = countCapturedQueriesByAnnotation(
      queries,
      'getVisibleCommentDescendantIdsPage:heads',
    )
    expect(stableGeneration ? descendantHeadQueries : 0).toBe(0)

    await makeTestPostPrivate(rootId)
    await setTestPostMarkdown(commentId, 'New private comment body')
    await caches.posts.invalidateCacheGetByAny(commentId)
    const after = await anonymous.get(descendantsPath)
    expect([200, 404]).toContain(after.status)
    expect(after.body.posts?.[commentId]?.markdown).not.toBe('New private comment body')
  })
})
