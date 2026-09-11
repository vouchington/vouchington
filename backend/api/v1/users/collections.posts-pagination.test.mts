import { describe, expect, it } from 'vitest'
import { encodeCursor } from '@modules/pagination'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertEntityRelation,
  insertTestPost,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'
import { getUserPostCollectionCursorScope } from '@services/entity-fetch/profile-collections'

describe('GET /api/v1/users/:idOrSlug/posts/:listType pagination', () => {
  it('continues an authenticated private post collection with after', async () => {
    const owner = await createTestUser()
    if (!owner) throw new Error('Failed to create owner')
    const postIds: string[] = []
    for (let index = 0; index < 3; index++) {
      const postId = await insertTestPost({
        title: `Route page ${owner.id} ${index}`,
        slug: `route-page-${owner.id}-${index}`,
        markdown: 'route page',
        createdById: owner.id,
      })
      postIds.push(postId)
      await insertEntityRelation('relation__user__save__post', owner.id, postId)
      await updateTestEntityRelationCreatedAt(
        'relation__user__save__post',
        owner.id,
        postId,
        new Date(Date.UTC(2026, 6, 18, 12, 0, 3 - index)),
      )
    }
    const request = createRequest()
    await request.authenticateAs(owner)

    const first = await request
      .get(`/api/v1/users/${owner.username}/posts/saved?limit=2`)
      .expect(200)
    const second = await request
      .get(
        `/api/v1/users/${owner.username}/posts/saved?limit=2&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(first.body.page_info.has_next_page).toBe(true)
    expect(first.body.page_info.start_cursor).not.toBe(first.body.page_info.end_cursor)
    expect(second.body.page_info.has_next_page).toBe(false)
    const resultIds = [...first.body.results, ...second.body.results].map(
      (post: { id: string }) => post.id,
    )
    expect(resultIds).toEqual(postIds)
    expect(new Set(resultIds).size).toBe(3)
  })

  it('returns 400 for a malformed cursor', async () => {
    const owner = await createTestUser()
    if (!owner) throw new Error('Failed to create owner')
    const request = createRequest()
    await request.authenticateAs(owner)

    await request.get(`/api/v1/users/${owner.username}/posts/saved?after=not-a-cursor`).expect(400)
  })

  it('returns 400 for a cursor scoped to another owner', async () => {
    const owner = await createTestUser()
    const otherOwner = await createTestUser()
    if (!owner || !otherOwner) throw new Error('Failed to create owners')
    const request = createRequest()
    await request.authenticateAs(owner)
    const cursor = collectionCursor(getUserPostCollectionCursorScope(otherOwner.id, 'saved'))

    await request
      .get(`/api/v1/users/${owner.username}/posts/saved?after=${encodeURIComponent(cursor)}`)
      .expect(400)
  })

  it('returns 400 for a cursor scoped to another list', async () => {
    const owner = await createTestUser()
    if (!owner) throw new Error('Failed to create owner')
    const request = createRequest()
    await request.authenticateAs(owner)
    const cursor = collectionCursor(getUserPostCollectionCursorScope(owner.id, 'hidden'))

    await request
      .get(`/api/v1/users/${owner.username}/posts/saved?after=${encodeURIComponent(cursor)}`)
      .expect(400)
  })
})

function collectionCursor(scope: string): string {
  return encodeCursor({
    timestamp: 1_700_000_000,
    id: '019d0000-0000-7000-8000-000000000003',
    scope,
  })
}
