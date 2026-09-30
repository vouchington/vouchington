import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, setTestUserDirectMessagesAudience } from '@voucha/test-helpers'
import { createConversation } from '@services/conversations-messages/create'
import { getConversationById } from '@services/conversations-messages'
import type { PrivateUser } from '@services/users/types'

const UUID = '00000000-0000-7000-8000-000000000001'
const uuids = (count: number) =>
  Array.from({ length: count }, (_, i) => `00000000-0000-7000-8000-${String(i).padStart(12, '0')}`)

type Method = 'post' | 'patch' | 'put'
type Case = readonly [label: string, method: Method, path: string, body: unknown]

// Messaging, imports, landing pages and push subscriptions. Path ids that pass the semantic UUID
// check but match nothing prove validation runs before any service lookup.
const malformed: readonly Case[] = [
  ['message thread without recipients', 'post', '/api/v1/my/messages', {}],
  ['message thread with a non-UUID recipient', 'post', '/api/v1/my/messages', { user_id: 'x' }],
  [
    'message thread with both recipient forms',
    'post',
    '/api/v1/my/messages',
    {
      user_id: UUID,
      user_ids: [UUID],
    },
  ],
  ['message thread with an empty recipient list', 'post', '/api/v1/my/messages', { user_ids: [] }],
  [
    'message thread with too many recipients',
    'post',
    '/api/v1/my/messages',
    {
      user_ids: uuids(26),
    },
  ],
  ['message thread with a null body', 'post', '/api/v1/my/messages', null],
  ['topic import without names', 'post', '/api/v1/my/import/topics', {}],
  ['topic import with a non-string name', 'post', '/api/v1/my/import/topics', { names: [7] }],
  [
    'topic import with too many names',
    'post',
    '/api/v1/my/import/topics',
    {
      names: Array.from({ length: 501 }, (_, i) => `Topic ${i}`),
    },
  ],
  ['feed import without a source', 'post', '/api/v1/my/import/rss-feeds', {}],
  ['feed import with two sources', 'post', '/api/v1/my/import/rss-feeds', { opml: 'a', csv: 'b' }],
  ['feed import with a non-string URL', 'post', '/api/v1/my/import/rss-feeds', { urls: [7] }],
  [
    'feed import with a string follow flag',
    'post',
    '/api/v1/my/import/rss-feeds',
    {
      urls: ['https://example.com/feed.xml'],
      follow: 'yes',
    },
  ],
  ['landing page without a slug', 'post', '/api/v1/my/landing-pages', { title: 'Page' }],
  [
    'landing page with a numeric title',
    'post',
    '/api/v1/my/landing-pages',
    {
      slug: 'page',
      title: 7,
    },
  ],
  [
    'push subscription without keys',
    'post',
    '/api/v1/my/notifications/push-subscriptions',
    {
      endpoint: 'https://push.example.com/x',
    },
  ],
]

// These routes gate on the conversation role or landing-page owner before the schema, so their
// 422 cases run against real resources below. `:id` is a random UUID for the anonymous 401.
const ownerGated: readonly Case[] = [
  ['participant without a user', 'post', '/api/v1/my/messages/:id/participants', {}],
  [
    'participant with a non-UUID user',
    'post',
    '/api/v1/my/messages/:id/participants',
    { user_id: 'x' },
  ],
  [
    'add policy with an unknown value',
    'patch',
    '/api/v1/my/messages/:id',
    { participant_add_policy: 'nobody' },
  ],
  [
    'landing page update with an unknown field',
    'patch',
    '/api/v1/my/landing-pages/:id',
    { owner_id: UUID },
  ],
  [
    'landing page items that are not a list',
    'put',
    '/api/v1/my/landing-pages/:id/items',
    { items: 'x' },
  ],
  [
    'landing page item with an unknown type',
    'put',
    '/api/v1/my/landing-pages/:id/items',
    { items: [{ type: 'video', url: 'https://example.com' }] },
  ],
]

// Plan #285: malformed input from an anonymous caller is a 401 with no diagnostic, and from an
// authenticated caller a 422 that fires after the identity, ownership and suspension checks.
describe('messaging and import request contract validation', () => {
  let user: PrivateUser
  let otherUser: PrivateUser
  let stranger: PrivateUser

  beforeAll(async () => {
    ;[user, otherUser, stranger] = await Promise.all([
      createTestUser(),
      createTestUser(),
      createTestUser(),
    ])
    await setTestUserDirectMessagesAudience(otherUser.id, 'everyone')
  })

  it.each([...malformed, ...ownerGated])(
    'returns 401 without a diagnostic for anonymous %s',
    async (_l, method, path, body) => {
      const anonymous = createRequest()
      const response = await anonymous[method](path.replace(':id', UUID))
        .send(body as object)
        .expect(401)
      expect(response.text).not.toMatch(/invalid/i)
    },
  )

  it.each(malformed)('returns 422 for %s', async (_label, method, path, body) => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request[method](path)
      .set('Content-Type', 'application/json')
      .send(JSON.stringify(body))
      .expect(422)
    expect(response.text).toMatch(/invalid/i)
  })

  describe('direct message threads', () => {
    let conversationId: string

    beforeAll(async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const created = await request
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      conversationId = created.body.conversation.id
    })

    it('returns 422 for a malformed message and 400 for blank text', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const path = `/api/v1/my/messages/${conversationId}/messages`
      await request.post(path).send({}).expect(422)
      await request.post(path).send({ text: 7 }).expect(422)
      await request.post(path).send({ text: 'hi', extra: true }).expect(422)
      await request.post(path).send({ text: '   ' }).expect(400)
      const response = await request.get(path).expect(200)
      expect(response.body.results).toEqual([])
    })

    it('checks membership before validating the body', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post(`/api/v1/my/messages/${UUID}/messages`).send({}).expect(403)
      await request.delete(`/api/v1/my/messages/${UUID}/participants/${UUID}`).expect(403)
    })

    it('still sends a valid message', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post(`/api/v1/my/messages/${conversationId}/messages`)
        .send({ text: 'hello' })
        .expect(201)
    })
  })

  describe('ownership and role gates', () => {
    let conversationId: string
    let pageId: string

    beforeAll(async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const conversation = await request
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      conversationId = conversation.body.conversation.id
      const page = await request
        .post('/api/v1/my/landing-pages')
        .send({ slug: `gate-${randomUUID().slice(0, 8)}`, title: 'Gate' })
        .expect(201)
      pageId = page.body.landing_page.id
    })

    // The conversation owner and the page owner get the schema 422. A plain member, an outsider,
    // and an unknown id are all stopped by the gate first, so the schema never speaks for them.
    it.each(ownerGated)(
      'returns 422 only to the owner for %s',
      async (_l, method, template, body) => {
        const isMessage = template.includes('/messages/')
        const path = template.replace(':id', isMessage ? conversationId : pageId)
        const deniedStatus = isMessage ? 403 : 404

        const owner = createRequest()
        await owner.authenticateAs(user)
        const response = await owner[method](path)
          .send(body as object)
          .expect(422)
        expect(response.text).toMatch(/invalid/i)

        for (const caller of [otherUser, stranger]) {
          const request = createRequest()
          await request.authenticateAs(caller)
          await request[method](path)
            .send(body as object)
            .expect(deniedStatus)
        }
        await owner[method](template.replace(':id', UUID))
          .send(body as object)
          .expect(deniedStatus)
      },
    )
  })

  describe('assistant conversations', () => {
    it('returns 422 for a malformed title without renaming, after the ownership checks', async () => {
      const conversation = await createConversation(user.id, 'Original')
      const path = `/api/v1/my/conversations/${conversation.id}`

      const owner = createRequest()
      await owner.authenticateAs(user)
      await owner.patch(path).send({ title: 7 }).expect(422)
      await owner.patch(path).send({ title: 'x', extra: true }).expect(422)
      expect((await getConversationById(conversation.id))?.title).toBe('Original')

      const other = createRequest()
      await other.authenticateAs(otherUser)
      await other.patch(path).send({ title: 7 }).expect(403)
      await owner.patch(`/api/v1/my/conversations/${UUID}`).send({ title: 7 }).expect(404)
    })

    it('lets the owner read messages and delete a conversation', async () => {
      const conversation = await createConversation(user.id, 'Disposable')
      const path = `/api/v1/my/conversations/${conversation.id}`
      const request = createRequest()
      await request.authenticateAs(user)
      const messages = await request.get(`${path}/messages`).expect(200)
      expect(messages.body.results).toEqual([])
      await request.delete(path).expect(204)
      await request.get(`${path}/messages`).expect(404)
    })
  })
})
