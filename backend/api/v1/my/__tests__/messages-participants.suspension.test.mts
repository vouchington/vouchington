import { describe, it, beforeAll } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers'
import { createTestGroupConversation } from '@voucha/test-helpers/entities/conversations'
import type { PrivateUser } from '@services/users/types'

describe('messages participants API suspension guard', () => {
  let outsider: PrivateUser

  beforeAll(async () => {
    outsider = await createTestUser()
  })

  it('POST participants returns 403 for a suspended owner', async () => {
    const suspendedOwner = await createTestUser()
    const conv = await createTestGroupConversation({
      createdById: suspendedOwner.id,
      memberUserIds: [],
    })
    await suspendTestUser(suspendedOwner.id)
    const request = createRequest()
    await request.authenticateAs(suspendedOwner)
    await request
      .post(`/api/v1/my/messages/${conv.id}/participants`)
      .send({ user_id: outsider.id })
      .expect(403)
  })

  it('DELETE participant returns 403 for a suspended participant leaving', async () => {
    const owner = await createTestUser()
    const suspendedMember = await createTestUser()
    const conv = await createTestGroupConversation({
      createdById: owner.id,
      memberUserIds: [suspendedMember.id],
    })
    await suspendTestUser(suspendedMember.id)
    const request = createRequest()
    await request.authenticateAs(suspendedMember)
    await request
      .delete(`/api/v1/my/messages/${conv.id}/participants/${suspendedMember.id}`)
      .expect(403)
  })
})
