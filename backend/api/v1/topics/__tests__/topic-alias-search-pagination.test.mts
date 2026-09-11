import { describe, it, expect } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { createTopicAliases } from '@services/topics/aliases'
import { encodeScopedAliasCursor } from '@modules/pagination'
import '../index.mts'

describe('GET /api/v1/topics/aliases pagination', () => {
  it('returns empty results with null cursors for a query with no matches', async () => {
    const admin = await createTestUser({ administrator: true })
    const random = Math.random().toString(36).slice(2, 15)
    const req = createRequest()
    await req.authenticateAs(admin)

    const res = await req
      .get('/api/v1/topics/aliases')
      .query({ q: `no-match-${random}` })
      .expect(200)
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
    const prefix = `partial-search-${random}`
    await createTopicAliases(topic.id, `${prefix}-only`)

    const req = createRequest()
    await req.authenticateAs(admin)
    const res = await req.get('/api/v1/topics/aliases').query({ q: prefix, limit: 5 }).expect(200)

    expect(res.body.results).toHaveLength(1)
    expect(res.body.page_info.has_next_page).toBe(false)
    expect(res.body.page_info.end_cursor).toBeNull()
    expect(res.body.page_info.start_cursor).not.toBeNull()
  })

  it('returns has_next_page false when results exactly fill the limit', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    const prefix = `exact-search-${random}`
    await createTopicAliases(topic.id, [`${prefix}-a`, `${prefix}-b`])

    const req = createRequest()
    await req.authenticateAs(admin)
    const res = await req.get('/api/v1/topics/aliases').query({ q: prefix, limit: 2 }).expect(200)

    expect(res.body.results).toHaveLength(2)
    expect(res.body.page_info.has_next_page).toBe(false)
  })

  it('paginates across multiple pages without duplicates or gaps', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    const prefix = `multi-search-${random}`
    await createTopicAliases(topic.id, [`${prefix}-a`, `${prefix}-b`, `${prefix}-c`])

    const req = createRequest()
    await req.authenticateAs(admin)

    const page1 = await req.get('/api/v1/topics/aliases').query({ q: prefix, limit: 2 }).expect(200)
    expect(page1.body.results.map((r: { alias: string }) => r.alias)).toEqual([
      `${prefix}-a`,
      `${prefix}-b`,
    ])
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()

    const page2 = await req
      .get('/api/v1/topics/aliases')
      .query({ q: prefix, limit: 2, after: page1.body.page_info.end_cursor as string })
      .expect(200)
    expect(page2.body.results.map((r: { alias: string }) => r.alias)).toEqual([`${prefix}-c`])
    expect(page2.body.page_info.has_next_page).toBe(false)
  })

  it('rejects a malformed cursor with 400', async () => {
    const admin = await createTestUser({ administrator: true })
    const req = createRequest()
    await req.authenticateAs(admin)

    await req
      .get('/api/v1/topics/aliases')
      .query({ q: 'whatever', after: 'not-a-real-cursor' })
      .expect(400)
  })

  it('rejects a cursor minted for a different q with 400 (cross-scope replay)', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    const prefixA = `scope-a-${random}`
    const prefixB = `scope-b-${random}`
    await createTopicAliases(topic.id, `${prefixA}-only`)

    const req = createRequest()
    await req.authenticateAs(admin)
    const pageA = await req
      .get('/api/v1/topics/aliases')
      .query({ q: prefixA, limit: 1 })
      .expect(200)
    const cursor = pageA.body.page_info.start_cursor as string
    expect(cursor).not.toBeNull()

    await req.get('/api/v1/topics/aliases').query({ q: prefixB, after: cursor }).expect(400)
  })

  it('rejects a cursor minted for the per-topic aliases list endpoint with 400 (cross-endpoint replay)', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const wrongScope = encodeScopedAliasCursor(
      'zzz-does-not-matter',
      `topic-aliases:${topic.id}:alias-asc`,
    )

    const req = createRequest()
    await req.authenticateAs(admin)
    await req.get('/api/v1/topics/aliases').query({ q: 'whatever', after: wrongScope }).expect(400)
  })
})
