import { describe, it, expect } from 'vitest'
import { v7 } from 'uuid'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestTopic } from '@voucha/test-helpers'
import { encodeScopedUuidCursor } from '@modules/pagination'
import { addAdditionalHostname } from '@services/topics/additional-hostnames'
import '../index.mts'

describe('GET /api/v1/topics/:idOrSlug/additional-hostnames pagination', () => {
  it('returns empty results with null cursors for a topic with no additional hostnames', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const req = createRequest()
    await req.authenticateAs(admin)

    const res = await req.get(`/api/v1/topics/${topic.id}/additional-hostnames`).expect(200)
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
    await addAdditionalHostname(topic.id, `partial-${random}.example.com`, admin.id)

    const req = createRequest()
    await req.authenticateAs(admin)
    const res = await req.get(`/api/v1/topics/${topic.id}/additional-hostnames?limit=5`).expect(200)

    expect(res.body.results).toHaveLength(1)
    expect(res.body.page_info.has_next_page).toBe(false)
    expect(res.body.page_info.end_cursor).toBeNull()
    expect(res.body.page_info.start_cursor).not.toBeNull()
  })

  it('returns has_next_page false when results exactly fill the limit', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    await addAdditionalHostname(topic.id, `exact-a-${random}.example.com`, admin.id)
    await addAdditionalHostname(topic.id, `exact-b-${random}.example.com`, admin.id)

    const req = createRequest()
    await req.authenticateAs(admin)
    const res = await req.get(`/api/v1/topics/${topic.id}/additional-hostnames?limit=2`).expect(200)

    expect(res.body.results).toHaveLength(2)
    expect(res.body.page_info.has_next_page).toBe(false)
  })

  it('paginates across multiple pages without duplicates or gaps', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    const first = await addAdditionalHostname(topic.id, `multi-a-${random}.example.com`, admin.id)
    const second = await addAdditionalHostname(topic.id, `multi-b-${random}.example.com`, admin.id)
    const third = await addAdditionalHostname(topic.id, `multi-c-${random}.example.com`, admin.id)

    const req = createRequest()
    await req.authenticateAs(admin)

    const page1 = await req
      .get(`/api/v1/topics/${topic.id}/additional-hostnames?limit=2`)
      .expect(200)
    expect(page1.body.results.map((h: { hostname_id: string }) => h.hostname_id)).toEqual([
      first.hostname_id,
      second.hostname_id,
    ])
    expect(page1.body.page_info.has_next_page).toBe(true)
    expect(page1.body.page_info.end_cursor).not.toBeNull()

    const cursor = encodeURIComponent(page1.body.page_info.end_cursor as string)
    const page2 = await req
      .get(`/api/v1/topics/${topic.id}/additional-hostnames?limit=2&after=${cursor}`)
      .expect(200)
    expect(page2.body.results.map((h: { hostname_id: string }) => h.hostname_id)).toEqual([
      third.hostname_id,
    ])
    expect(page2.body.page_info.has_next_page).toBe(false)
  })

  it('rejects a malformed cursor with 400', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const req = createRequest()
    await req.authenticateAs(admin)

    await req
      .get(`/api/v1/topics/${topic.id}/additional-hostnames?after=not-a-real-cursor`)
      .expect(400)
  })

  it('rejects a cursor minted for another topic with 400 (cross-resource replay)', async () => {
    const admin = await createTestUser({ administrator: true })
    const topicA = await createTestTopic()
    const topicB = await createTestTopic()
    const random = Math.random().toString(36).slice(2, 15)
    await addAdditionalHostname(topicA.id, `cross-${random}.example.com`, admin.id)

    const req = createRequest()
    await req.authenticateAs(admin)
    const pageA = await req
      .get(`/api/v1/topics/${topicA.id}/additional-hostnames?limit=1`)
      .expect(200)
    const cursor = pageA.body.page_info.start_cursor as string
    expect(cursor).not.toBeNull()

    await req
      .get(`/api/v1/topics/${topicB.id}/additional-hostnames?after=${encodeURIComponent(cursor)}`)
      .expect(400)
  })

  it('rejects a cursor minted for the passkeys endpoint with 400 (cross-endpoint replay)', async () => {
    const admin = await createTestUser({ administrator: true })
    const topic = await createTestTopic()
    const wrongScope = encodeScopedUuidCursor(v7(), `passkeys:${admin.id}:created-at-asc-id-asc`)

    const req = createRequest()
    await req.authenticateAs(admin)
    await req
      .get(
        `/api/v1/topics/${topic.id}/additional-hostnames?after=${encodeURIComponent(wrongScope)}`,
      )
      .expect(400)
  })
})
