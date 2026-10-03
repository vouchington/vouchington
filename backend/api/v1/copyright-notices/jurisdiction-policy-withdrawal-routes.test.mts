import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'

describe('jurisdiction copyright policy withdrawal', () => {
  it('lets an administrator withdraw an approved policy', async () => {
    const administrator = await createTestUser({ administrator: true })
    const administratorRequest = createRequest()
    await administratorRequest.authenticateAs(administrator)
    const approval = await administratorRequest
      .post('/api/v1/copyright-jurisdiction-policies')
      .send({
        jurisdiction: 'eu_dsa',
        policy_version: `eu-${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`,
      })
      .expect(201)
    await administratorRequest.post('/api/v1/copyright-territorial-policies').send({}).expect(404)
    await administratorRequest
      .post(
        `/api/v1/copyright-territorial-policies/${approval.body.copyright_jurisdiction_policy.id}/withdrawals`,
      )
      .expect(404)
    const withdrawal = await administratorRequest
      .post(
        `/api/v1/copyright-jurisdiction-policies/${approval.body.copyright_jurisdiction_policy.id}/withdrawals`,
      )
      .expect(201)
    expect(withdrawal.body.copyright_jurisdiction_policy_withdrawal.id).toEqual(expect.any(String))
  })
})
