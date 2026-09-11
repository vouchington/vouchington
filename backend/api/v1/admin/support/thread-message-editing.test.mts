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

describe('support draft editing', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('rejects editing an approved draft without changing its persisted body', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+approved-draft-edit-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      bodyText: 'Approved draft.',
      draftedAt: new Date(),
    })
    const request = createRequest()
    await request.authenticateAs(admin)
    const approvalPath = `/api/v1/support/threads/${thread.id}/messages/${message.id}/approvals`
    await request.post(approvalPath).expect(201)

    const response = await request
      .patch(`/api/v1/support/threads/${thread.id}/messages/${message.id}`)
      .send({ body_text: 'Attempted revision.' })
      .expect(404)

    expect(response.body.message).toBe('Message not found or not editable')
    const messages = await request.get(`/api/v1/support/threads/${thread.id}/messages`).expect(200)
    expect(messages.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ body_text: 'Approved draft.', id: message.id }),
      ]),
    )
  })

  it('does not edit a draft after a concurrent thread resolution commits', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+resolved-draft-edit-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      bodyText: 'Original draft.',
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
    const edit = request
      .patch(`/api/v1/support/threads/${thread.id}/messages/${message.id}`)
      .send({ body_text: 'Stale revision.' })
      .expect(409)
    release.resolve()
    await resolution

    await edit
    const messages = await request.get(`/api/v1/support/threads/${thread.id}/messages`).expect(200)
    expect(messages.body.results).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: message.id, body_text: 'Original draft.' }),
      ]),
    )
  })
})
