import { afterEach, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import {
  createTestUser,
  insertTestRewardsProgramStatus,
  suspendTestUser,
  unsuspendTestUser,
} from '@voucha/test-helpers'
import { ACCOUNT_SUSPENDED } from '@modules/on-error/error-codes'
import { createIndividualRewardsProgramStatus } from '@services/individuals-households'

describe('rewards program status suspension guards', () => {
  const suspendedUserIds: string[] = []

  afterEach(async () => {
    await Promise.all(suspendedUserIds.splice(0).map(unsuspendTestUser))
  })

  it.each(['post', 'patch', 'delete'] as const)(
    'rejects suspended %s mutations without changing status rows',
    async method => {
      const user = await createTestUser()
      const statusId = await insertTestRewardsProgramStatus({ createdById: user.id })
      const existing = await createIndividualRewardsProgramStatus(user, user, statusId)
      await suspendTestUser(user.id)
      suspendedUserIds.push(user.id)
      const request = createRequest()
      await request.authenticateAs(user)
      const response =
        method === 'post'
          ? await request
              .post('/api/v1/my/rewards-program-statuses')
              .send({ rewards_program_status_id: statusId })
          : method === 'patch'
            ? await request
                .patch(`/api/v1/my/rewards-program-statuses/${existing.id}`)
                .send({ since: '2024-01-01' })
            : await request.delete(`/api/v1/my/rewards-program-statuses/${existing.id}`)
      expect(response.status).toBe(403)
      expect(response.body.code).toBe(ACCOUNT_SUSPENDED)
    },
  )
})
