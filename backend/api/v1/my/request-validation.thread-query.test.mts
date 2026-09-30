import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, setTestUserDirectMessagesAudience } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

const threadReads = ['messages', 'participants'] as const

// Plan #285: the paginated reads under /my/messages/:conversationId gate on conversation
// membership before anything else. The parser keeps its 400 and its clamping for a member, and the
// declared query schema is checked after the parser and never speaks first.
describe.each(threadReads)('GET /api/v1/my/messages/:conversationId/%s query validation', read => {
  let member: PrivateUser
  let recipient: PrivateUser
  let stranger: PrivateUser
  let conversationId: string
  const pathFor = (id: string) => `/api/v1/my/messages/${id}/${read}`

  const as = async (caller: PrivateUser) => {
    const request = createRequest()
    await request.authenticateAs(caller)
    return request
  }

  beforeAll(async () => {
    ;[member, recipient, stranger] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    await setTestUserDirectMessagesAudience(recipient.id, 'everyone')
    const request = await as(member)
    const created = await request
      .post('/api/v1/my/messages')
      .send({ user_id: recipient.id })
      .expect(201)
    conversationId = created.body.conversation.id
    for (const text of ['one', 'two', 'three']) {
      await request
        .post(`/api/v1/my/messages/${conversationId}/messages`)
        .send({ text })
        .expect(201)
    }
  })

  it('returns 401 without a diagnostic for an anonymous malformed query', async () => {
    const response = await createRequest()
      .get(`${pathFor(randomUUID())}?limit=abc&after=x`)
      .expect(401)
    expect(response.text).not.toMatch(/invalid/i)
  })

  it('answers a non-member 403 before any query diagnostic', async () => {
    for (const caller of [stranger]) {
      const request = await as(caller)
      for (const query of ['limit=abc', 'limit=0', 'after=garbage', 'after=a&after=b']) {
        await request.get(`${pathFor(conversationId)}?${query}`).expect(403)
      }
    }
    const request = await as(member)
    await request.get(`${pathFor(randomUUID())}?limit=abc`).expect(403)
  })

  it.each([
    ['a non-numeric limit', 'limit=abc'],
    ['a zero limit', 'limit=0'],
    ['a repeated limit', 'limit=5&limit=6'],
    ['an empty cursor', 'after='],
    ['a repeated cursor', 'after=a&after=b'],
    ['a malformed cursor', 'after=garbage'],
  ])('keeps the parser 400 for a member with %s', async (_label, query) => {
    const request = await as(member)
    const response = await request.get(`${pathFor(conversationId)}?${query}`).expect(400)
    expect(response.text).not.toContain('Invalid request query')
  })

  it.each(['', 'limit=500', 'limit=1', 'limit=100&foo=bar', 'foo=bar'])(
    'still serves %j to a member, clamping limit and ignoring unknown parameters',
    async query => {
      const request = await as(member)
      const response = await request.get(`${pathFor(conversationId)}?${query}`).expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
      expect(response.body.results.length).toBeLessThanOrEqual(100)
      expect(response.body.page_info).toBeDefined()
    },
  )

  it('pages with a valid limit as before', async () => {
    const request = await as(member)
    const first = await request.get(`${pathFor(conversationId)}?limit=1`).expect(200)
    expect(first.body.results).toHaveLength(1)
    expect(first.body.page_info.has_next_page).toBe(true)
    const all = await request.get(`${pathFor(conversationId)}?limit=100`).expect(200)
    expect(all.body.page_info.has_next_page).toBe(false)
    expect(all.body.results).toHaveLength(read === 'messages' ? 3 : 2)
  })
})
