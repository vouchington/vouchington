import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestSupportContact,
  insertTestSupportMessage,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import { resolveTestSupportThreadWhileLocked } from '@voucha/test-helpers/entities/support-threads'
import type { PrivateUser } from '@services/users/types'

describe('support message sends', () => {
  let admin: PrivateUser

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
  })

  it('rejects an approved draft after the thread is resolved', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+resolved-send-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      bodyText: 'Approved draft must not send after resolution.',
      draftedAt: new Date(),
      approvedAt: new Date(),
      approvedById: admin.id,
    })
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.patch(`/api/v1/support/threads/${thread.id}`).send({ resolved: true }).expect(200)

    const response = await request
      .post(`/api/v1/support/threads/${thread.id}/messages/${message.id}/sends`)
      .expect(409)

    expect(response.body.message).toBe('Reopen this thread before sending a reply')
  })

  it('serializes a send behind an in-flight resolution', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+concurrent-resolved-send-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const message = await insertTestSupportMessage({
      supportThreadId: thread.id,
      direction: 'outbound',
      bodyText: 'A resolution lock must prevent this send.',
      draftedAt: new Date(),
      approvedAt: new Date(),
      approvedById: admin.id,
    })
    let releaseResolution: (() => void) | undefined
    const resolutionRelease = new Promise<void>(resolve => {
      releaseResolution = resolve
    })
    let signalResolutionLock: (() => void) | undefined
    const resolutionLocked = new Promise<void>(resolve => {
      signalResolutionLock = resolve
    })
    const resolution = resolveTestSupportThreadWhileLocked(
      thread.id,
      admin.id,
      () => signalResolutionLock?.(),
      resolutionRelease,
    )
    await resolutionLocked

    const request = createRequest()
    await request.authenticateAs(admin)
    const send = request
      .post(`/api/v1/support/threads/${thread.id}/messages/${message.id}/sends`)
      .expect(409)
    releaseResolution?.()
    await resolution

    const response = await send
    expect(response.body.message).toBe('Reopen this thread before sending a reply')
  })
})
