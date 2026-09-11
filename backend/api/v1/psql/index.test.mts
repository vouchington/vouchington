import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'

describe('POST /api/v1/psql/jobs', () => {
  it('enqueues runConfigDriven and returns 200', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/psql/jobs')
      .send({ type: 'runConfigDriven' })
      .expect(200)

    expect(response.body).toMatchObject({ success: true })
  })
})
