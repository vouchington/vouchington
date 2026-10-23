import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
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

  it('enqueues the remaining psql admin jobs', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)

    for (const type of ['runMigrations', 'runViews', 'cleanupPartitions']) {
      const response = await request.post('/api/v1/psql/jobs').send({ type }).expect(200)
      expect(response.body).toMatchObject({ success: true })
    }
    const response = await request
      .post('/api/v1/psql/jobs')
      .send({
        type: 'createPartitions',
        range: {
          table: 'ai_agent_call_receipts',
          fromId: '01990000-0000-7000-8000-000000000000',
          toId: '019a0000-0000-7000-8000-000000000000',
          maxRows: 100,
        },
      })
      .expect(200)
    expect(response.body).toMatchObject({ success: true })
  })

  it('rejects invalid manual ranges and range fields on other jobs before queue admission', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/psql/jobs')
      .send({
        type: 'createPartitions',
        range: {
          table: 'ai_agent_call_receipts',
          fromId: '019a0000-0000-7000-8000-000000000000',
          toId: '01990000-0000-7000-8000-000000000000',
          maxRows: 10,
        },
      })
      .expect(422)
    await request
      .post('/api/v1/psql/jobs')
      .send({
        type: 'createPartitions',
        range: {
          table: 'ai_agent_call_receipts',
          fromId: '01990000-0000-7000-8000-000000000000',
          toId: '019a0000-0000-7000-8000-000000000000'.toUpperCase(),
          maxRows: 10,
        },
      })
      .expect(422)
    await request
      .post('/api/v1/psql/jobs')
      .send({ type: 'runViews', range: { table: 'ai_agent_call_receipts' } })
      .expect(422)
  })
})
