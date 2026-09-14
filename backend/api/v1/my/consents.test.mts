import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { grantConsent } from '@services/user-consents/create'
import type { PrivateUser } from '@services/users/types'

describe('GET /api/v1/my/consents', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/consents').expect(401)
  })

  it('returns empty results for new user', async () => {
    const newUser = await createTestUser()
    const request = createRequest()
    await request.authenticateAs(newUser)

    const response = await request.get('/api/v1/my/consents').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body).not.toHaveProperty('page_info')
  })

  it('returns active consents', async () => {
    await grantConsent(user.id, 'privacy_policy', '1.0')
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/consents').expect(200)
    const found = response.body.results.find(
      (c: { consent_type: string }) => c.consent_type === 'privacy_policy',
    )
    expect(found).toBeDefined()
    expect(found.version).toBe('1.0')
  })
})

describe('POST /api/v1/my/consents', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/my/consents')
      .set('Content-Type', 'application/json')
      .send({ consent_type: 'privacy_policy', version: '1.0' })
      .expect(401)
  })

  it('returns 415 for non-JSON content-type', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/my/consents').send('consent_type=privacy_policy').expect(415)
  })

  it('returns 400 for invalid consent_type', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/consents')
      .set('Content-Type', 'application/json')
      .send({ consent_type: 'invalid_type', version: '1.0' })
      .expect(400)
  })

  it('returns 400 when version is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/consents')
      .set('Content-Type', 'application/json')
      .send({ consent_type: 'privacy_policy' })
      .expect(400)
  })

  it('grants consent and returns 201', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/consents')
      .set('Content-Type', 'application/json')
      .send({ consent_type: 'terms_of_service', version: '2.0' })
      .expect(201)

    expect(response.body.consent).toBeDefined()
    expect(response.body.consent.consent_type).toBe('terms_of_service')
    expect(response.body.consent.version).toBe('2.0')
    expect(response.body.consent.revoked_at).toBeNull()
  })
})

describe('DELETE /api/v1/my/consents/:type', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })

  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.delete('/api/v1/my/consents/privacy_policy').expect(401)
  })

  it('returns 400 for invalid consent type', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/my/consents/not_a_valid_type').expect(400)
  })

  it('returns 204 on successful revoke', async () => {
    await grantConsent(user.id, 'cookie_analytics', '1.0')
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/my/consents/cookie_analytics').expect(204)
  })
})
