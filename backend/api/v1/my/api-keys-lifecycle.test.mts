import { beforeAll, describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createApiKey, revokeApiKey } from '@services/api-keys'
import { setTestApiKeyExpiry } from '@voucha/test-helpers/entities/api-keys'
import '../../../rss/index.mts'

describe('owner API key expiry and rotation routes', () => {
  beforeAll(() => {
    process.env.API_KEY_CHECKSUM_SECRET ??= 'synthetic lifecycle route checksum secret'
  })
  it('rejects unauthenticated rotation and conceals another owners key', async () => {
    const owner = await createTestUser()
    const stranger = await createTestUser()
    const key = await createApiKey(owner.id, 'rss', 'Owner', ['rss:read'])
    const request = createRequest()
    await request.post(`/api/v1/my/api-keys/${key.apiKey.id}/rotate`).send({}).expect(401)
    await request.authenticateAs(stranger)
    await request.post(`/api/v1/my/api-keys/${key.apiKey.id}/rotate`).send({}).expect(404)
    const list = await request.get('/api/v1/my/api-keys').expect(200)
    expect(list.body.results).toEqual([])
  })
  it('returns the raw replacement only from rotation and refuses duplicate rotation', async () => {
    const owner = await createTestUser()
    const old = await createApiKey(owner.id, 'rss', 'Rotate route', ['rss:read'])
    const request = createRequest()
    await request.authenticateAs(owner)
    const response = await request
      .post(`/api/v1/my/api-keys/${old.apiKey.id}/rotate`)
      .send({})
      .expect(201)
    expect(response.body.raw_key).toMatch(/^voucha_rss_/)
    expect(response.body.api_key.expires_at).toBeTruthy()
    const list = await request.get('/api/v1/my/api-keys').expect(200)
    expect(list.text).not.toContain(response.body.raw_key)
    expect(
      list.body.results.find((key: { id: string }) => key.id === old.apiKey.id)
        .replaced_by_api_key_id,
    ).toBe(response.body.api_key.id)
    await request.post(`/api/v1/my/api-keys/${old.apiKey.id}/rotate`).send({}).expect(409)
  })
  it.each([null, 365])('refuses administrator creation lifetime %s', async lifetime_days => {
    const owner = await createTestUser({ administrator: true })
    const request = createRequest()
    await request.authenticateAs(owner)
    await request
      .post('/api/v1/my/api-keys')
      .send({
        label: 'Administrator',
        type: 'rss',
        permissions: ['rss:read'],
        lifetime_days,
      })
      .expect(400)
  })
  it.each(['/rss/news', '/rss/posts'])(
    'returns identical rejection for expired and revoked keys on %s',
    async path => {
      const owner = await createTestUser()
      const expired = await createApiKey(owner.id, 'rss', 'Expired RSS', ['rss:read'])
      const revoked = await createApiKey(owner.id, 'rss', 'Revoked RSS', ['rss:read'])
      await setTestApiKeyExpiry(expired.apiKey.id, new Date(Date.now() - 1000))
      await revokeApiKey(owner.id, revoked.apiKey.id)
      const request = createRequest()
      const a = await request.get(path).query({ apikey: expired.rawKey }).expect(403)
      const b = await request.get(path).query({ apikey: revoked.rawKey }).expect(403)
      expect(a.body).toEqual(b.body)
    },
  )
})
