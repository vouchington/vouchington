import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { registerStaffRequestContractTests } from '../../../test-helpers/staff-request-contract-matrix.mts'

const URL = '/api/v1/blacklist/source-sync'

describe('blacklist source-sync request contract', () => {
  registerStaffRequestContractTests([
    ['sourceId missing', 'post', URL, {}],
    ['sourceId type', 'post', URL, { sourceId: true }],
    ['sourceId object', 'post', URL, { sourceId: { id: 1 } }],
    ['unknown key', 'post', URL, { sourceId: '1', extra: 1 }],
  ])

  it('keeps 400 for a well-typed but non-positive source id and accepts a numeric id', async () => {
    const admin = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(admin)

    await request.post(URL).send({ sourceId: '0' }).expect(400)
    await request.post(URL).send({ sourceId: 'abc' }).expect(400)
    expect((await request.post(URL).send({ sourceId: 1 }).expect(200)).body).toMatchObject({
      success: true,
    })
  })
})
