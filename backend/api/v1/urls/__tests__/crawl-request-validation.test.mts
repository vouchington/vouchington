import { randomUUID } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { registerStaffRequestContractTests } from '../../../../test-helpers/staff-request-contract-matrix.mts'

describe('POST /api/v1/urls/:id/crawl request contract', () => {
  registerStaffRequestContractTests([['non-UUID URL id', 'post', '/api/v1/urls/not-a-uuid/crawl']])

  it('answers 404 for an unknown URL id and enqueues nothing', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request.post(`/api/v1/urls/${randomUUID()}/crawl`).expect(404)
    expect(response.body).not.toHaveProperty('success')
  })
})
