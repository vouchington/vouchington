import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportMessage,
  insertTestSupportThread,
  resolveTestSupportThreadWhileLocked,
} from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'

describe('thread-message approvals', () => {
  const rand = () => Math.random().toString(36).slice(2, 10)
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .post(
        '/api/v1/support/threads/00000000-0000-0000-0000-000000000000/messages/00000000-0000-0000-0000-000000000000/approvals',
      )
      .expect(401)
  })

  it('admin can approve a draft message', async () => {
    const suffix = rand()
    const contact = await insertTestSupportContact({
      emailAddress: `tests+msg-approve-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      bodyText: `Draft to approve ${suffix}`,
      draftedAt: new Date(),
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const response = await request
      .post(`/api/v1/support/threads/${thread.id}/messages/${message.id}/approvals`)
      .expect(201)

    expect(response.body.message).toHaveProperty('approved_by_id', admin.id)
    expect(response.body.message.approved_at).not.toBeNull()
  })

  it('returns 422 when approving an already approved draft', async () => {
    const suffix = rand()
    const contact = await insertTestSupportContact({
      emailAddress: `tests+msg-approve-repeat-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      bodyText: `Draft to approve once ${suffix}`,
      draftedAt: new Date(),
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    const path = `/api/v1/support/threads/${thread.id}/messages/${message.id}/approvals`
    await request.post(path).expect(201)
    const response = await request.post(path).expect(422)

    expect(response.body.message).toBe('Message has already been approved')
  })

  it('returns 422 when message is not a draft', async () => {
    const suffix = rand()
    const contact = await insertTestSupportContact({
      emailAddress: `tests+msg-approve-inbound-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'inbound',
      bodyText: `Inbound message ${suffix}`,
    })

    const request = createRequest()
    await request.authenticateAs(admin)
    await request
      .post(`/api/v1/support/threads/${thread.id}/messages/${message.id}/approvals`)
      .expect(422)
  })

  it('does not approve a draft after a concurrent thread resolution commits', async () => {
    const suffix = rand()
    const contact = await insertTestSupportContact({
      emailAddress: `tests+resolved-draft-approve-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      bodyText: `Draft to leave unapproved ${suffix}`,
      draftedAt: new Date(),
    })
    const request = createRequest()
    await request.authenticateAs(admin)
    const locked = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const resolution = resolveTestSupportThreadWhileLocked(
      thread.id,
      admin.id,
      () => locked.resolve(),
      release.promise,
    )
    await locked.promise
    const approval = request
      .post(`/api/v1/support/threads/${thread.id}/messages/${message.id}/approvals`)
      .expect(409)
    release.resolve()
    await resolution

    await approval
    const messages = await request.get(`/api/v1/support/threads/${thread.id}/messages`).expect(200)
    expect(messages.body.results).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: message.id, approved_at: null })]),
    )
  })
})
