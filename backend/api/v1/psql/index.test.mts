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
})
