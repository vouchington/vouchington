import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import {
  createConversation,
  createConversationMessage,
} from '@services/conversations-messages/create'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/conversations', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/conversations').expect(401)
  })

  it('returns empty results for a new user with no conversations', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/conversations').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info).toBeDefined()
    expect(response.body.page_info.has_next_page).toBe(false)
  })

  it('returns conversations created by the user', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const title = `Test Conv ${suffix}`
    await createConversation(user.id, title)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/conversations').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    const found = response.body.results.find((c: { title: string }) => c.title === title)
    expect(found).toBeDefined()
    expect(found.created_by_id).toBe(user.id)
  })

  it('does not return conversations from other users', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    await createConversation(otherUser.id, `Other user conv ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/conversations').expect(200)
    const allOwnedByUser = response.body.results.every(
      (c: { created_by_id: string }) => c.created_by_id === user.id,
    )
    expect(allOwnedByUser).toBe(true)
  })

  it('supports cursor pagination via after parameter', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    // Create 3 conversations for pagination testing
    const conv1 = await createConversation(user.id, `Pagination conv A ${suffix}`)
    const conv2 = await createConversation(user.id, `Pagination conv B ${suffix}`)
    await createConversation(user.id, `Pagination conv C ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)

    // Get first page (limit=2)
    const firstPage = await request
      .get('/api/v1/my/conversations')
      .query({ limit: '2' })
      .expect(200)

    expect(firstPage.body.results.length).toBeLessThanOrEqual(2)

    // Use cursor from first page to get next page
    expect(firstPage.body.page_info.end_cursor).toBeTruthy()
    const secondPage = await request
      .get('/api/v1/my/conversations')
      .query({ after: firstPage.body.page_info.end_cursor })
      .expect(200)

    // IDs on second page should be different from first page
    const firstIds = new Set(firstPage.body.results.map((c: { id: string }) => c.id))
    const overlap = secondPage.body.results.filter((c: { id: string }) => firstIds.has(c.id))
    expect(overlap).toHaveLength(0)

    // Verify our conversations are reachable
    const allResponse = await request.get('/api/v1/my/conversations').expect(200)
    const ids = allResponse.body.results.map((c: { id: string }) => c.id)
    expect(ids).toContain(conv1.id)
    expect(ids).toContain(conv2.id)
  })
})

describe('GET /api/v1/my/conversations/:conversationId/messages', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .get('/api/v1/my/conversations/00000000-0000-7000-8000-000000000001/messages')
      .expect(401)
  })

  it('returns 404 for non-existent conversation', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .get('/api/v1/my/conversations/00000000-0000-7000-8000-000000000001/messages')
      .expect(404)
  })

  it('returns 403 for conversation owned by another user', async () => {
    const conv = await createConversation(otherUser.id, 'Other user conv')

    const request = createRequest()
    await request.authenticateAs(user)
    await request.get(`/api/v1/my/conversations/${conv.id}/messages`).expect(403)
  })

  it('returns messages for the user owns conversation', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Conv with messages ${suffix}`)
    await createConversationMessage(conv.id, user.id, {
      role: 'user',
      content: `Hello ${suffix}`,
    })
    await createConversationMessage(conv.id, user.id, {
      role: 'assistant',
      content: `Hi there ${suffix}`,
    })

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/my/conversations/${conv.id}/messages`).expect(200)

    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.results.length).toBe(2)
    expect(response.body.results[0].conversation_id).toBe(conv.id)
    expect(response.body.page_info.has_next_page).toBe(false)
    expect(response.body.page_info.start_cursor).toBeTruthy()
    expect(response.body.page_info.end_cursor).toBeNull()
  })

  it('returns empty messages list for conversation with no messages', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Empty conv ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request.get(`/api/v1/my/conversations/${conv.id}/messages`).expect(200)

    expect(response.body.results).toEqual([])
  })

  it('paginates three messages chronologically without gaps or duplicates', async () => {
    const conv = await createConversation(user.id, `Paged messages ${crypto.randomUUID()}`)
    const created = []
    for (const content of ['oldest', 'middle', 'newest']) {
      created.push(await createConversationMessage(conv.id, user.id, { role: 'user', content }))
    }

    const request = createRequest()
    await request.authenticateAs(user)
    const first = await request
      .get(`/api/v1/my/conversations/${conv.id}/messages`)
      .query({ limit: '2' })
      .expect(200)
    const second = await request
      .get(`/api/v1/my/conversations/${conv.id}/messages`)
      .query({ limit: '2', after: first.body.page_info.end_cursor })
      .expect(200)

    expect(first.body.results.map((message: { id: string }) => message.id)).toEqual([
      created[1]!.id,
      created[2]!.id,
    ])
    expect(first.body.page_info.has_next_page).toBe(true)
    expect(second.body.results.map((message: { id: string }) => message.id)).toEqual([
      created[0]!.id,
    ])
    expect(second.body.page_info.has_next_page).toBe(false)
    expect(
      new Set(
        [...first.body.results, ...second.body.results].map(
          (message: { id: string }) => message.id,
        ),
      ).size,
    ).toBe(3)
  })

  it('returns 403 for admin accessing unlinked conversation', async () => {
    const admin = await createTestUser({ administrator: true })
    const conv = await createConversation(
      user.id,
      `Admin unlinked ${crypto.randomUUID().slice(0, 8)}`,
    )

    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get(`/api/v1/my/conversations/${conv.id}/messages`).expect(403)
  })

  it('returns 200 for admin accessing conversation linked via support thread', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Admin linked ${suffix}`)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+my-conv-admin-${suffix}@voucha.ai`,
      userId: user.id,
    })
    await insertTestSupportThread({ supportContactId: contact.id, conversationId: conv.id })

    const request = createRequest()
    await request.authenticateAs(admin)
    await request.get(`/api/v1/my/conversations/${conv.id}/messages`).expect(200)
  })
})
