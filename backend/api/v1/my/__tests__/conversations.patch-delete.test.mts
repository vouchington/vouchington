import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import { createConversation } from '@services/conversations-messages/create'
import type { PrivateUser } from '@services/users/types'

describe('PATCH /api/v1/my/conversations/:conversationId', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .patch('/api/v1/my/conversations/00000000-0000-7000-8000-000000000001')
      .send({ title: 'New title' })
      .expect(401)
  })

  it('returns 415 without JSON content-type', async () => {
    const conv = await createConversation(user.id, 'Test conv')
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/my/conversations/${conv.id}`)
      .set('Content-Type', 'text/plain')
      .send('title=New title')
      .expect(415)
  })

  it('returns 404 for non-existent conversation', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch('/api/v1/my/conversations/00000000-0000-7000-8000-000000000001')
      .send({ title: 'New title' })
      .expect(404)
  })

  it('returns 403 for conversation owned by another user', async () => {
    const conv = await createConversation(otherUser.id, 'Other user conv')

    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/my/conversations/${conv.id}`)
      .send({ title: 'Hacked title' })
      .expect(403)
  })

  it('returns 403 for admin patching unlinked conversation', async () => {
    const admin = await createTestUser({ administrator: true })
    const conv = await createConversation(
      user.id,
      `Admin patch unlinked ${crypto.randomUUID().slice(0, 8)}`,
    )

    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .patch(`/api/v1/my/conversations/${conv.id}`)
      .send({ title: 'Hacked title' })
      .expect(403)
  })

  it('returns 200 for admin patching conversation linked via support thread', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Admin patch linked ${suffix}`)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+my-conv-patch-${suffix}@voucha.ai`,
      userId: user.id,
    })
    await insertTestSupportThread({ supportContactId: contact.id, conversationId: conv.id })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .patch(`/api/v1/my/conversations/${conv.id}`)
      .send({ title: `Admin updated ${suffix}` })
      .expect(200)
    expect(response.body.conversation.id).toBe(conv.id)
  })

  it('returns 400 when title is missing from body', async () => {
    const conv = await createConversation(user.id, 'Original title')

    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .patch(`/api/v1/my/conversations/${conv.id}`)
      .send({ other_field: 'value' })
      .expect(400)
  })

  it('returns 400 when title is not a string', async () => {
    const conv = await createConversation(user.id, 'Original title')

    const request = createRequest()
    await request.authenticateAs(user)
    await request.patch(`/api/v1/my/conversations/${conv.id}`).send({ title: 123 }).expect(400)
  })

  it('updates title and returns updated conversation', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Original ${suffix}`)
    const newTitle = `Updated title ${suffix}`

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .patch(`/api/v1/my/conversations/${conv.id}`)
      .send({ title: newTitle })
      .expect(200)

    expect(response.body.conversation.id).toBe(conv.id)
    expect(response.body.conversation.title).toBe(newTitle)
  })

  it('allows empty string as title', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Has a title ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .patch(`/api/v1/my/conversations/${conv.id}`)
      .send({ title: '' })
      .expect(200)

    expect(response.body.conversation.title).toBe('')
  })
})

describe('DELETE /api/v1/my/conversations/:conversationId', () => {
  let user: PrivateUser
  let otherUser: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    otherUser = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .delete('/api/v1/my/conversations/00000000-0000-7000-8000-000000000001')
      .expect(401)
  })

  it('returns 404 for non-existent conversation', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .delete('/api/v1/my/conversations/00000000-0000-7000-8000-000000000001')
      .expect(404)
  })

  it('returns 403 for conversation owned by another user', async () => {
    const conv = await createConversation(otherUser.id, 'Other user conv')

    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/my/conversations/${conv.id}`).expect(403)
  })

  it('returns 403 for admin deleting unlinked conversation', async () => {
    const admin = await createTestUser({ administrator: true })
    const conv = await createConversation(
      user.id,
      `Admin delete unlinked ${crypto.randomUUID().slice(0, 8)}`,
    )

    const request = createRequest()
    await request.authenticateAs(admin)
    await request.delete(`/api/v1/my/conversations/${conv.id}`).expect(403)
  })

  it('returns 204 for admin deleting conversation linked via support thread', async () => {
    const admin = await createTestUser({ administrator: true })
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Admin delete linked ${suffix}`)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+my-conv-delete-${suffix}@voucha.ai`,
      userId: user.id,
    })
    await insertTestSupportThread({ supportContactId: contact.id, conversationId: conv.id })

    const request = createRequest()
    await request.authenticateAs(admin)
    await request.delete(`/api/v1/my/conversations/${conv.id}`).expect(204)
  })

  it('soft-deletes conversation and returns 204', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `To be deleted ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/my/conversations/${conv.id}`).expect(204)
  })

  it('deleted conversation is no longer listed', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Gone soon ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)

    // Confirm it's there
    const before = await request.get('/api/v1/my/conversations').expect(200)
    const beforeIds = before.body.results.map((c: { id: string }) => c.id)
    expect(beforeIds).toContain(conv.id)

    // Delete it
    await request.delete(`/api/v1/my/conversations/${conv.id}`).expect(204)

    // Confirm it's gone from listing
    const after = await request.get('/api/v1/my/conversations').expect(200)
    const afterIds = after.body.results.map((c: { id: string }) => c.id)
    expect(afterIds).not.toContain(conv.id)
  })

  it('deleted conversation messages return 404', async () => {
    const suffix = crypto.randomUUID().slice(0, 8)
    const conv = await createConversation(user.id, `Messages gone too ${suffix}`)

    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/my/conversations/${conv.id}`).expect(204)

    await request.get(`/api/v1/my/conversations/${conv.id}/messages`).expect(404)
  })
})
