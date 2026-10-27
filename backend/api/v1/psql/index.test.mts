import { describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { verifyDeviceJwt } from '@ts-shared/session-jwt'

describe('POST /api/v1/psql/jobs', () => {
  it('requires completed MFA for an enrolled administrator fixture', async () => {
    const member = await createTestUser()
    const ordinary = createRequest()
    await ordinary.authenticateAs(member)
    const ordinaryDeviceToken = ordinary.authCookie.match(/(?:^|; )dt=([^;]+)/)?.[1]
    expect(ordinaryDeviceToken).toBeDefined()
    expect((await verifyDeviceJwt(ordinaryDeviceToken!))?.mfa_at).toBeUndefined()
    await ordinary.get('/api/v1/psql/migrations').expect(403)

    const user = await createTestUser({ administrator: true })
    const raw = createRequest()
    await raw.authenticateAsRaw(user)
    await raw.get('/api/v1/psql/migrations').expect(403)

    const verified = createRequest()
    await verified.authenticateAs(user)
    await verified.get('/api/v1/psql/migrations').expect(200)
  })

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

    for (const type of ['runMigrations', 'runViews', 'createPartitions', 'cleanupPartitions']) {
      const response = await request.post('/api/v1/psql/jobs').send({ type }).expect(200)
      expect(response.body).toMatchObject({ success: true })
    }
  })

  it('rejects malformed or misplaced classifier ranges before enqueue', async () => {
    const user = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(user)

    await request
      .post('/api/v1/psql/jobs')
      .send({
        type: 'createPartitions',
        classifierRange: { fromDate: '2026-02-30', toDate: '2026-03-01' },
      })
      .expect(422)
    await request
      .post('/api/v1/psql/jobs')
      .send({
        type: 'runMigrations',
        classifierRange: { fromDate: '2026-01-01', toDate: '2026-02-01' },
      })
      .expect(422)
  })

  it('admits a valid classifier range only for an authorized administrator', async () => {
    const range = { fromDate: '2020-02-01', toDate: '2020-02-02', maxDefaultRows: 100 }
    const administrator = await createTestUser({ administrator: true })
    const authorizedRequest = createRequest()
    await authorizedRequest.authenticateAs(administrator)
    for (const type of ['createPartitions', 'cleanupPartitions']) {
      await authorizedRequest
        .post('/api/v1/psql/jobs')
        .send({ type, classifierRange: range })
        .expect(200)
    }

    const regularUser = await createTestUser()
    const unauthorizedRequest = createRequest()
    await unauthorizedRequest.authenticateAs(regularUser)
    await unauthorizedRequest
      .post('/api/v1/psql/jobs')
      .send({ type: 'createPartitions', classifierRange: range })
      .expect(403)
  })
})
