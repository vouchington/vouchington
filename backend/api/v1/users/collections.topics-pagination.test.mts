import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestTopic,
  createTestUser,
  insertEntityRelation,
  safeUsername,
} from '@voucha/test-helpers'
import { upsertRecentlyViewed } from '@services/recently-viewed'

describe('GET /api/v1/users/:idOrSlug topics collection pagination', () => {
  it('paginates followed topics at the exact limit without duplicates', async () => {
    const owner = await createTestUser({ username: safeUsername('topic-page-owner') })
    if (!owner) throw new Error('Failed to create owner')
    const topics = await Promise.all([
      createTestTopic({ name: `Topic page A ${owner.id}`, slug: `topic-page-a-${owner.id}` }),
      createTestTopic({ name: `Topic page B ${owner.id}`, slug: `topic-page-b-${owner.id}` }),
      createTestTopic({ name: `Topic page C ${owner.id}`, slug: `topic-page-c-${owner.id}` }),
    ])
    await Promise.all(
      topics.map(topic =>
        insertEntityRelation('relation__user__follow__topic', owner.id, topic.id),
      ),
    )

    const page1 = await createRequest()
      .get(`/api/v1/users/${owner.id}/topics/following?limit=2`)
      .expect(200)
    const page2 = await createRequest()
      .get(
        `/api/v1/users/${owner.id}/topics/following?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(new Set([...page1.body.results, ...page2.body.results].map(topic => topic.id))).toEqual(
      new Set(topics.map(topic => topic.id)),
    )
  })

  it('paginates blocked topics at the exact limit without duplicates', async () => {
    const owner = await createTestUser({ username: safeUsername('topic-blocked-page') })
    if (!owner) throw new Error('Failed to create owner')
    const topics = await Promise.all([
      createTestTopic({ name: `Topic blocked A ${owner.id}`, slug: `topic-blocked-a-${owner.id}` }),
      createTestTopic({ name: `Topic blocked B ${owner.id}`, slug: `topic-blocked-b-${owner.id}` }),
      createTestTopic({ name: `Topic blocked C ${owner.id}`, slug: `topic-blocked-c-${owner.id}` }),
    ])
    await Promise.all(
      topics.map(topic => insertEntityRelation('relation__user__block__topic', owner.id, topic.id)),
    )

    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request.get(`/api/v1/users/${owner.id}/topics/blocked?limit=2`).expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/topics/blocked?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page2.body.results).toHaveLength(1)
    expect(page2.body.page_info).toMatchObject({ has_next_page: false, end_cursor: null })
    expect(new Set([...page1.body.results, ...page2.body.results].map(topic => topic.id))).toEqual(
      new Set(topics.map(topic => topic.id)),
    )
  })

  it('rejects a followed-topic cursor replayed for another user or list type', async () => {
    const owner = await createTestUser({ username: safeUsername('topic-scope-owner') })
    const other = await createTestUser({ username: safeUsername('topic-scope-other') })
    if (!owner || !other) throw new Error('Failed to create users')
    const topics = await Promise.all([
      createTestTopic({ name: `Topic scope A ${owner.id}`, slug: `topic-scope-a-${owner.id}` }),
      createTestTopic({ name: `Topic scope B ${owner.id}`, slug: `topic-scope-b-${owner.id}` }),
    ])
    await Promise.all(
      topics.map(topic =>
        insertEntityRelation('relation__user__follow__topic', owner.id, topic.id),
      ),
    )
    const first = await createRequest()
      .get(`/api/v1/users/${owner.id}/topics/following?limit=1`)
      .expect(200)

    await createRequest()
      .get(
        `/api/v1/users/${other.id}/topics/following?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(400)

    const ownerRequest = createRequest()
    await ownerRequest.authenticateAs(owner)
    await ownerRequest
      .get(
        `/api/v1/users/${owner.id}/topics/viewed?limit=1&after=${encodeURIComponent(first.body.page_info.end_cursor)}`,
      )
      .expect(400)
  })

  it('paginates recently viewed topics with score and UUID cursors', async () => {
    const owner = await createTestUser({ username: safeUsername('topic-viewed-page') })
    if (!owner) throw new Error('Failed to create owner')
    const topics = await Promise.all([
      createTestTopic({ name: `Viewed page A ${owner.id}`, slug: `viewed-page-a-${owner.id}` }),
      createTestTopic({ name: `Viewed page B ${owner.id}`, slug: `viewed-page-b-${owner.id}` }),
      createTestTopic({ name: `Viewed page C ${owner.id}`, slug: `viewed-page-c-${owner.id}` }),
    ])
    await Promise.all(topics.map(topic => upsertRecentlyViewed('topic', topic.id, null, owner.id)))
    const request = createRequest()
    await request.authenticateAs(owner)
    const page1 = await request.get(`/api/v1/users/${owner.id}/topics/viewed?limit=2`).expect(200)
    const page2 = await request
      .get(
        `/api/v1/users/${owner.id}/topics/viewed?limit=2&after=${encodeURIComponent(page1.body.page_info.end_cursor)}`,
      )
      .expect(200)

    expect(page1.body.results).toHaveLength(2)
    expect(page2.body.results).toHaveLength(1)
    expect(new Set([...page1.body.results, ...page2.body.results].map(topic => topic.id))).toEqual(
      new Set(topics.map(topic => topic.id)),
    )
  })
})
