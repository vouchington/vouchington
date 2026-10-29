import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertEntityRelation,
  insertTestPost,
  updateTestEntityRelationCreatedAt,
} from '@voucha/test-helpers'

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
    const postId = await insertTestPost({
      title: `Other owner's saved post ${otherOwner.id}`,
      slug: `other-owner-cursor-${otherOwner.id}`,
      markdown: 'Other owner cursor',
      createdById: otherOwner.id,
    })
    await insertEntityRelation('relation__user__save__post', otherOwner.id, postId)
    const sourceRequest = createRequest()
    await sourceRequest.authenticateAs(otherOwner)
    const source = await sourceRequest
      .get(`/api/v1/users/${otherOwner.username}/posts/saved`)
      .expect(200)
    const cursor = source.body.page_info.start_cursor as string
    expect(cursor).toEqual(expect.any(String))
    const request = createRequest()
    await request.authenticateAs(owner)

    await request
      .get(`/api/v1/users/${owner.username}/posts/saved?after=${encodeURIComponent(cursor)}`)
      .expect(400)
  })

  it('returns 400 for a cursor scoped to another list', async () => {
    const owner = await createTestUser()
    if (!owner) throw new Error('Failed to create owner')
    const postId = await insertTestPost({
      title: `Hidden cursor source ${owner.id}`,
      slug: `hidden-cursor-source-${owner.id}`,
      markdown: 'Hidden cursor source',
      createdById: owner.id,
    })
    await insertEntityRelation('relation__user__hide__post', owner.id, postId)
    const request = createRequest()
    await request.authenticateAs(owner)
    const source = await request.get(`/api/v1/users/${owner.username}/posts/hidden`).expect(200)
    const cursor = source.body.page_info.start_cursor as string
    expect(cursor).toEqual(expect.any(String))

    await request
      .get(`/api/v1/users/${owner.username}/posts/saved?after=${encodeURIComponent(cursor)}`)
      .expect(400)
  })
})
