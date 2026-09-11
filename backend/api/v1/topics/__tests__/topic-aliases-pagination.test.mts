import { describe, it, expect } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { encodeScopedUuidCursor, encodeScopedAliasCursor } from '@modules/pagination'
import { createTopicAliases } from '@services/topics/aliases'
import { topicAliasSearchCursorScope } from '@services/topics/search-topic-aliases'
import '../index.mts'

describe('GET /api/v1/topics/:idOrSlug/aliases pagination', () => {
  it('returns empty results with null cursors for a topic with no aliases', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const req = createRequest()
    await req.authenticateAs(admin)

    const res = await req.get(`/api/v1/topics/${topic.id}/aliases`).expect(200)
    expect(res.body.results).toEqual([])
    expect(res.body.page_info).toEqual({
      has_next_page: false,
      start_cursor: null,
      end_cursor: null,
    })
  })

  it('returns a partial page with has_next_page false and a null end_cursor', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    await createTopicAliases(topic.id, `partial-${random}`)

    const req = createRequest()
    await req.authenticateAs(admin)
    const res = await req.get(`/api/v1/topics/${topic.id}/aliases?limit=5`).expect(200)

    expect(res.body.results).toHaveLength(1)
    expect(res.body.page_info.has_next_page).toBe(false)
    expect(res.body.page_info.end_cursor).toBeNull()
    expect(res.body.page_info.start_cursor).not.toBeNull()
  })

  it('returns has_next_page false when results exactly fill the limit', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    await createTopicAliases(topic.id, [`exact-a-${random}`, `exact-b-${random}`])

    const req = createRequest()
    await req.authenticateAs(admin)
    const res = await req.get(`/api/v1/topics/${topic.id}/aliases?limit=2`).expect(200)

    expect(res.body.results).toHaveLength(2)
    expect(res.body.page_info.has_next_page).toBe(false)
  })

  it('paginates across multiple pages without duplicates or gaps', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    await createTopicAliases(topic.id, [
      `multi-a-${random}`,
      `multi-b-${random}`,
      `multi-c-${random}`,
    ])

    const req = createRequest()
    await req.authenticateAs(admin)

    const page1 = await req.get(`/api/v1/topics/${topic.id}/aliases?limit=2`).expect(200)
    expect(page1.body.results).toEqual([`multi-a-${random}`, `multi-b-${random}`])
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()

    const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
    const page2 = await req
      .get(`/api/v1/topics/${topic.id}/aliases?limit=2&after=${cursor}`)
      .expect(200)
    expect(page2.body.results).toEqual([`multi-c-${random}`])
    expect(page2.body.page_info.has_next_page).toBe(false)
  })

  it('rejects a malformed cursor with 400', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const req = createRequest()
    await req.authenticateAs(admin)

    await req.get(`/api/v1/topics/${topic.id}/aliases?after=not-a-real-cursor`).expect(400)
  })

  it('rejects a cursor minted for another topic with 400 (cross-resource replay)', async () => {
    const admin = await createTestUser({ administrator: true })
    const topicA = await createTestTopic()
    const topicB = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    await createTopicAliases(topicA.id, `cross-${random}`)

    const req = createRequest()
    await req.authenticateAs(admin)
    const pageA = await req.get(`/api/v1/topics/${topicA.id}/aliases?limit=1`).expect(200)
    const cursor = pageA.body.page_info.start_cursor as string
    expect(cursor).not.toBeNull()

    await req
      .get(`/api/v1/topics/${topicB.id}/aliases?after=${encodeURIComponent(cursor)}`)
      .expect(400)
  })

  it('rejects a cursor minted for the alias-search endpoint with 400 (cross-endpoint replay)', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const wrongScope = encodeScopedAliasCursor(
      'zzz-does-not-matter',
      topicAliasSearchCursorScope({ prefixQuery: 'some-q' }),
    )

    const req = createRequest()
    await req.authenticateAs(admin)
    await req
      .get(`/api/v1/topics/${topic.id}/aliases?after=${encodeURIComponent(wrongScope)}`)
      .expect(400)
  })

  it('rejects a cursor with valid-but-wrong shape ({id,scope}) minted from the additional-hostnames domain with 400', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const wrongShape = encodeScopedUuidCursor(v7(), `additional-hostnames:${topic.id}:id-asc`)

    const req = createRequest()
    await req.authenticateAs(admin)
    await req
      .get(`/api/v1/topics/${topic.id}/aliases?after=${encodeURIComponent(wrongShape)}`)
      .expect(400)
  })
})
