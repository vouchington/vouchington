import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('territorial copyright policy withdrawal', () => {
  it('lets an administrator withdraw an approved policy', async () => {
    const administrator = await createTestUser({ administrator: true })
    const administratorRequest = createRequest()
    await administratorRequest.authenticateAs(administrator)
    const approval = await administratorRequest
      .post('/api/v1/copyright-territorial-policies')
      .send({
        jurisdiction: 'eu_dsa',
        policy_version: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      })
      .expect(201)
    const withdrawal = await administratorRequest
      .post(
        `/api/v1/copyright-territorial-policies/${approval.body.copyright_territorial_policy.id}/withdrawals`,
      )
      .expect(201)
    expect(withdrawal.body.copyright_territorial_policy_withdrawal.id).toEqual(expect.any(String))
  })
})
