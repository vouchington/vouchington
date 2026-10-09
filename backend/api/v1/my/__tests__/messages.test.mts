import { describe, it, expect, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestBlock,
  insertTestLocalFollow,
  insertTestMute,
  setTestUserDirectMessagesAudience,
  suspendTestUser,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { encodeCursor } from '@modules/pagination'

describe('messages API', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    ;[user, otherUser] = await Promise.all([createTestUser(), createTestUser()])
    await setTestUserDirectMessagesAudience(otherUser.id, 'everyone')
  })

  describe('GET /api/v1/my/messages', () => {
    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.get('/api/v1/my/messages').expect(401)
    })

    it('returns list of conversations for authenticated user', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.get('/api/v1/my/messages').expect(200)
      expect(response.body).toHaveProperty('results')
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns the participant add policy for each conversation', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const created = await request
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)

      const response = await request.get('/api/v1/my/messages').expect(200)
      const conversation = response.body.results.find(
        (result: { id: string }) => result.id === created.body.conversation.id,
      )
      expect(conversation).toMatchObject({ participant_add_policy: 'owner_only' })
    })

    it('returns page_info with cursor pagination', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request.get('/api/v1/my/messages').expect(200)
      expect(response.body.page_info).toHaveProperty('has_next_page')
      expect(response.body.page_info).toHaveProperty('end_cursor')
    })

    it('returns 400 for an invalid after cursor', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.get('/api/v1/my/messages?after=invalid').expect(400)
    })

    it('accepts a valid after cursor and returns 200', async () => {
      const cursor = encodeCursor({
        timestamp: '2020-01-01T00:00:00.000000Z',
        id: '00000000-0000-7000-8000-000000000001',
      })
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .get(`/api/v1/my/messages?after=${encodeURIComponent(cursor)}`)
        .expect(200)
      expect(Array.isArray(response.body.results)).toBe(true)
    })

    it('returns 400 for an out-of-range timestamp cursor', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const cursor = encodeCursor({
        timestamp: Number.MAX_SAFE_INTEGER,
        id: '00000000-0000-7000-8000-000000000001',
      })
      await request.get(`/api/v1/my/messages?after=${encodeURIComponent(cursor)}`).expect(400)
    })
  })

  describe('POST /api/v1/my/messages', () => {
    it('returns 403 for a suspended user', async () => {
      const suspended = await createTestUser()
      await suspendTestUser(suspended.id)
      const request = createRequest()
      await request.authenticateAs(suspended)
      await request.post('/api/v1/my/messages').send({ user_id: otherUser.id }).expect(403)
    })

    it('returns 401 when not authenticated', async () => {
      const request = createRequest()
      await request.post('/api/v1/my/messages').send({ user_id: otherUser.id }).expect(401)
    })

    it('creates a DM conversation with user_id', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const response = await request
        .post('/api/v1/my/messages')
        .send({ user_id: otherUser.id })
        .expect(201)
      expect(response.body.conversation).toHaveProperty('id')
      expect(response.body.conversation.channel_type).toBe('direct_message')
    })

    it('returns 422 when user_id is missing', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({}).expect(422)
    })

    it('returns 400 when messaging yourself', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({ user_id: user.id }).expect(400)
    })

    it('returns 422 when user_id is not a UUID', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({ user_id: 'not-a-uuid' }).expect(422)
    })

    it('returns 403 when recipient has nobody DM audience', async () => {
      const noDmUser = await createTestUser()
      await setTestUserDirectMessagesAudience(noDmUser.id, 'nobody')

      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({ user_id: noDmUser.id }).expect(403)
    })

    it('creates a group DM with user_ids array', async () => {
      const user2 = await createTestUser()
      const user3 = await createTestUser()
      await Promise.all([
        setTestUserDirectMessagesAudience(user2.id, 'everyone'),
        setTestUserDirectMessagesAudience(user3.id, 'everyone'),
      ])

      const groupSender = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(groupSender)
      const response = await request
        .post('/api/v1/my/messages')
        .send({ user_ids: [user2.id, user3.id] })
        .expect(201)
      expect(response.body.conversation).toHaveProperty('id')
      expect(response.body.conversation.channel_type).toBe('direct_message')
    })

    it('returns 422 when user_ids exceeds the 25-recipient limit', async () => {
      const tooManyIds = Array.from({ length: 26 }, () => crypto.randomUUID())
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({ user_ids: tooManyIds }).expect(422)
    })

    it('returns 403 when two recipients in a group DM have blocked each other', async () => {
      const user2 = await createTestUser()
      const user3 = await createTestUser()
      await Promise.all([
        setTestUserDirectMessagesAudience(user2.id, 'everyone'),
        setTestUserDirectMessagesAudience(user3.id, 'everyone'),
        insertTestBlock(user2.id, user3.id),
      ])

      const groupSender = await createTestUser()
      const request = createRequest()
      await request.authenticateAs(groupSender)
      await request
        .post('/api/v1/my/messages')
        .send({ user_ids: [user2.id, user3.id] })
        .expect(403)
    })

    it('returns 404 for a missing recipient before checking the others', async () => {
      const nobodyUser = await createTestUser()
      await setTestUserDirectMessagesAudience(nobodyUser.id, 'nobody')

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/my/messages')
        .send({ user_ids: [nobodyUser.id, crypto.randomUUID()] })
        .expect(404)
    })

    it('returns 403 when the recipient has blocked the sender', async () => {
      const recipient = await createTestUser()
      await Promise.all([
        setTestUserDirectMessagesAudience(recipient.id, 'everyone'),
        insertTestBlock(recipient.id, user.id),
      ])

      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({ user_id: recipient.id }).expect(403)
    })

    it('returns 403 when the sender has blocked the recipient', async () => {
      const recipient = await createTestUser()
      await Promise.all([
        setTestUserDirectMessagesAudience(recipient.id, 'everyone'),
        insertTestBlock(user.id, recipient.id),
      ])

      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({ user_id: recipient.id }).expect(403)
    })

    it.each([
      ['sender muted the recipient', true],
      ['recipient muted the sender', false],
    ])('returns 403 when the %s', async (_label, senderMutes) => {
      const recipient = await createTestUser()
      await setTestUserDirectMessagesAudience(recipient.id, 'everyone')
      if (senderMutes) await insertTestMute(user.id, recipient.id)
      else await insertTestMute(recipient.id, user.id)

      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({ user_id: recipient.id }).expect(403)
    })

    it('applies each audience value to the sender', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      const create = async (audience: string, follows?: 'sender' | 'both') => {
        const recipient = await createTestUser()
        await setTestUserDirectMessagesAudience(recipient.id, audience)
        if (follows) await insertTestLocalFollow(user.id, recipient.id)
        if (follows === 'both') await insertTestLocalFollow(recipient.id, user.id)
        return request.post('/api/v1/my/messages').send({ user_id: recipient.id })
      }

      await create('everyone').then(r => expect(r.status).toBe(201))
      await create('users').then(r => expect(r.status).toBe(201))
      await create('followers').then(r => expect(r.status).toBe(403))
      await create('followers', 'sender').then(r => expect(r.status).toBe(201))
      await create('mutual_followers', 'sender').then(r => expect(r.status).toBe(403))
      await create('mutual_followers', 'both').then(r => expect(r.status).toBe(201))
      await create('nobody', 'both').then(r => expect(r.status).toBe(403))
    })

    it('returns 403 for a group when only one recipient refuses the sender', async () => {
      const open = await createTestUser()
      const blocker = await createTestUser()
      await Promise.all([
        setTestUserDirectMessagesAudience(open.id, 'everyone'),
        setTestUserDirectMessagesAudience(blocker.id, 'everyone'),
        insertTestBlock(blocker.id, user.id),
      ])

      const request = createRequest()
      await request.authenticateAs(user)
      await request
        .post('/api/v1/my/messages')
        .send({ user_ids: [open.id, blocker.id] })
        .expect(403)
    })

    it('returns 422 when user_ids is empty array', async () => {
      const request = createRequest()
      await request.authenticateAs(user)
      await request.post('/api/v1/my/messages').send({ user_ids: [] }).expect(422)
    })
  })
})
