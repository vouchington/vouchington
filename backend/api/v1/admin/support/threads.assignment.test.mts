import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  getTestSupportThreadLifecycleChanges,
  insertTestSupportContact,
  insertTestSupportThread,
} from '@voucha/test-helpers'
import { waitForBlockedSupportThreadLock } from '@voucha/test-helpers/entities/support-agent-runs'
import { resolveTestSupportThreadWhileLocked } from '@voucha/test-helpers/entities/support-threads'
import type { PrivateUser } from '@services/users/types'

describe('support thread assignment', () => {
  let admin: PrivateUser
  let otherAdmin: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    ;[admin, otherAdmin, regularUser] = await Promise.all([
      createTestUser({ administrator: true }),
      createTestUser({ administrator: true }),
      createTestUser(),
    ])
  })

  it('rejects another administrator as the assignment target', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+admin-thread-assign-other-admin-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request
      .patch(`/api/v1/support/threads/${thread.id}`)
      .send({ assigned_to_id: otherAdmin.id })
      .expect(422)
  })

  it('rejects an assignment target other than the authenticated administrator', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+admin-thread-assign-target-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .patch(`/api/v1/support/threads/${thread.id}`)
      .send({ assigned_to_id: regularUser.id })
      .expect(422)

    expect(response.body.message).toBe(
      'Support threads can only be assigned to the authenticated administrator',
    )
  })

  it('rejects assigning a resolved thread without recording an assignment', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+admin-thread-assign-resolved-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const request = createRequest()
    await request.authenticateAs(admin)
    await request.patch(`/api/v1/support/threads/${thread.id}`).send({ resolved: true }).expect(200)

    const response = await request
      .patch(`/api/v1/support/threads/${thread.id}`)
      .send({ assigned_to_id: admin.id })
      .expect(409)

    expect(response.body.message).toBe('Reopen this thread before assigning it')
    const changes = await getTestSupportThreadLifecycleChanges(thread.id)
    expect(changes.map(change => change.change_type)).toEqual(['resolve'])
  })

  it('serializes assignment behind an in-flight resolution', async () => {
    const suffix = Math.random().toString(36).slice(2, 10)
    const contact = await insertTestSupportContact({
      emailAddress: `tests+admin-thread-assign-concurrent-resolved-${suffix}@voucha.ai`,
    })
    const thread = await insertTestSupportThread({ supportContactId: contact.id })
    const locked = Promise.withResolvers<void>()
    const release = Promise.withResolvers<void>()
    const resolution = resolveTestSupportThreadWhileLocked(
      thread.id,
      admin.id,
      () => locked.resolve(),
      release.promise,
    )
    await locked.promise

    const request = createRequest()
    await request.authenticateAs(admin)
    const assignment = request
      .patch(`/api/v1/support/threads/${thread.id}`)
      .send({ assigned_to_id: admin.id })
      .expect(409)
      .then(response => response)
    await waitForBlockedSupportThreadLock('/* assignSupportThread */')
    release.resolve()
    await resolution

    const response = await assignment
    expect(response.body.message).toBe('Reopen this thread before assigning it')
    const updated = await request.get(`/api/v1/support/threads/${thread.id}`).expect(200)
    expect(updated.body.thread).toMatchObject({ status: 'resolved', assigned_to_id: null })
    expect(await getTestSupportThreadLifecycleChanges(thread.id)).toEqual([])
  })
})
