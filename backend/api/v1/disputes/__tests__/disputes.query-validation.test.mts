import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import { registerCaseListQueryContractTests } from '../../../../test-helpers/case-list-query-contract-tests.mts'

describe('GET /api/v1/disputes query contract', () => {
  registerCaseListQueryContractTests({ path: '/api/v1/disputes', listKey: 'disputes' })
})

describe('GET /api/v1/disputes/:id consistency query', () => {
  let staff: PrivateUser
  let member: PrivateUser
  const missingId = crypto.randomUUID()

  beforeAll(async () => {
    staff = await createTestUser({ administrator: true })
    member = await createTestUser()
  })

  it.each(['consistency=replica', 'consistency=', 'consistency=primary&consistency=primary'])(
    'rejects invalid %s for staff and members',
    async query => {
      for (const viewer of [staff, member]) {
        const request = createRequest()
        await request.authenticateAs(viewer)
        const response = await request.get(`/api/v1/disputes/${missingId}?${query}`).expect(422)
        expect(response.text).toContain('Invalid request query')
      }
    },
  )

  it('accepts a staff primary read and ignores the valid hint for a member', async () => {
    for (const viewer of [staff, member]) {
      const request = createRequest()
      await request.authenticateAs(viewer)
      await request.get(`/api/v1/disputes/${missingId}?consistency=primary`).expect(404)
    }
  })
})
