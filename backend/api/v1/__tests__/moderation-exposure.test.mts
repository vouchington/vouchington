import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import type { PrivateUser } from '@services/users/types'
import type { getExposureState } from '@services/moderation-exposure'

type ExposureState = Awaited<ReturnType<typeof getExposureState>>

describe('POST /api/v1/moderation/reveals', () => {
  let adminUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 401 when unauthenticated', async () => {
    const req = createRequest()
    await req.post('/api/v1/moderation/reveals').send({ surface: 'mod_queue' }).expect(401)
  })

  it('returns 403 when authenticated as a non-moderator user', async () => {
    const req = createRequest()
    await req.authenticateAs(regularUser)
    await req.post('/api/v1/moderation/reveals').send({ surface: 'mod_queue' }).expect(403)
  })

  it('returns 422 when surface is missing', async () => {
    const req = createRequest()
    await req.authenticateAs(adminUser)
    await req.post('/api/v1/moderation/reveals').send({}).expect(422)
  })

  it('returns 422 when surface is invalid', async () => {
    const req = createRequest()
    await req.authenticateAs(adminUser)
    await req.post('/api/v1/moderation/reveals').send({ surface: 'invalid_surface' }).expect(422)
  })

  it.each(['postId', 'reportId'] as const)('returns 422 when %s is not a UUID', async field => {
    const req = createRequest()
    await req.authenticateAs(adminUser)
    await req
      .post('/api/v1/moderation/reveals')
      .send({ surface: 'mod_queue', [field]: 'not-a-uuid' })
      .expect(422)
  })

  it('checks the role before the body contract and records nothing for a malformed body', async () => {
    const anonymous = await createRequest().post('/api/v1/moderation/reveals').send({ surface: 5 })
    expect(anonymous.status).toBe(401)
    expect(anonymous.text).not.toMatch(/schema|must be|required|invalid/i)
    const outsider = createRequest()
    await outsider.authenticateAs(regularUser)
    await outsider.post('/api/v1/moderation/reveals').send({ surface: 5 }).expect(403)

    const req = createRequest()
    await req.authenticateAs(adminUser)
    const before = await req.get('/api/v1/moderation/exposure').expect(200)
    for (const body of [{ surface: 5 }, { surface: 'mod_queue', extra: 1 }, { surface: null }]) {
      await req.post('/api/v1/moderation/reveals').send(body).expect(422)
    }
    const after = await req.get('/api/v1/moderation/exposure').expect(200)
    expect(after.body.exposure.count).toBe(before.body.exposure.count)
  })

  it('records a reveal and returns exposure state for a moderator', async () => {
    const req = createRequest()
    await req.authenticateAs(adminUser)
    const before = await req.get('/api/v1/moderation/exposure').expect(200)
    const response = await req
      .post('/api/v1/moderation/reveals')
      .send({ surface: 'mod_queue' })
      .expect(200)

    expect(response.body).toHaveProperty('exposure')
    const exposure = response.body.exposure as ExposureState
    expect(typeof exposure.count).toBe('number')
    expect(exposure.count).toBe(before.body.exposure.count + 1)
    expect(typeof exposure.threshold).toBe('number')
    expect(typeof exposure.in_cooldown).toBe('boolean')
  })

  it('accepts an optional postId in the body', async () => {
    const req = createRequest()
    await req.authenticateAs(adminUser)
    const response = await req
      .post('/api/v1/moderation/reveals')
      .send({ surface: 'post_page', postId: null })
      .expect(200)

    expect(response.body).toHaveProperty('exposure')
  })
})

describe('GET /api/v1/moderation/exposure', () => {
  let adminUser: PrivateUser
  let regularUser: PrivateUser

  beforeAll(async () => {
    adminUser = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
  })

  it('returns 401 when unauthenticated', async () => {
    const req = createRequest()
    await req.get('/api/v1/moderation/exposure').expect(401)
  })

  it('returns exposure state for any authenticated user', async () => {
    const req = createRequest()
    await req.authenticateAs(regularUser)
    const response = await req.get('/api/v1/moderation/exposure').expect(200)

    expect(response.body).toHaveProperty('exposure')
    const exposure = response.body.exposure as ExposureState
    expect(typeof exposure.count).toBe('number')
    expect(typeof exposure.threshold).toBe('number')
    expect(typeof exposure.in_cooldown).toBe('boolean')
  })

  it('returns exposure state for an admin user', async () => {
    const req = createRequest()
    await req.authenticateAs(adminUser)
    const response = await req.get('/api/v1/moderation/exposure').expect(200)

    expect(response.body).toHaveProperty('exposure')
    const exposure = response.body.exposure as ExposureState
    expect(exposure.in_cooldown).toBe(false)
    expect(exposure.cooldown_ends_at).toBeNull()
  })
})
