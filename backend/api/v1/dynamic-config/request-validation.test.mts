import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { countDynamicConfigAuditRows, createTestUser } from '@voucha/test-helpers'
import { registerStaffRequestContractTests } from '../../../test-helpers/staff-request-contract-matrix.mts'

const URL = '/api/v1/dynamic-config/namespaces/feature-flags'

describe('PATCH /api/v1/dynamic-config/namespaces/:namespace request contract', () => {
  registerStaffRequestContractTests([
    ['missing config', 'patch', URL, {}],
    ['null config', 'patch', URL, { config: null }],
    ['array config', 'patch', URL, { config: [] }],
    ['scalar config', 'patch', URL, { config: 'on' }],
    ['unknown key', 'patch', URL, { config: {}, extra: 1 }],
  ])

  it('writes no audit row for a malformed body and keeps the semantic 400', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin)
    const before = await countDynamicConfigAuditRows('feature-flags')

    await request.patch(URL).send({ config: 'on' }).expect(422)
    await request.patch(URL).send({ config: {}, extra: 1 }).expect(422)
    await request
      .patch(URL)
      .send({ config: { memberships: 'yes' } })
      .expect(400)

    expect(await countDynamicConfigAuditRows('feature-flags')).toBe(before)
  })

  it('keeps the role and namespace lookups ahead of the body contract', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.patch('/api/v1/dynamic-config/namespaces/no-such-namespace').send({}).expect(404)
  })
})
