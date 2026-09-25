import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'
import { expectApiKeyPagination } from './api-keys-pagination-test-support.mts'

describe('GET /api/v1/my/api-keys', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.get('/api/v1/my/api-keys').expect(401)
  })

  it('returns empty results for new user', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request.get('/api/v1/my/api-keys').expect(200)
    expect(Array.isArray(response.body.results)).toBe(true)
    expect(response.body.page_info).toBeDefined()
    expect(typeof response.body.page_info.has_next_page).toBe('boolean')
  })

  it('paginates API keys without duplicates', async () => {
    await expectApiKeyPagination(user)
  })
})

describe('POST /api/v1/my/api-keys', () => {
  let user: PrivateUser
  let admin: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
    admin = await createTestUser({ administrator: true })
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'Test', permissions: ['rss:read'] })
      .expect(401)
  })

  it('returns 415 for non-JSON content-type', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.post('/api/v1/my/api-keys').send('label=test').expect(415)
  })

  it('returns 400 when label is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ permissions: ['rss:read'] })
      .expect(400)
  })

  it('returns 400 when label is empty string', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: '   ', permissions: ['rss:read'] })
      .expect(400)
  })

  it('returns 400 when label exceeds 100 characters', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'x'.repeat(101), permissions: ['rss:read'] })
      .expect(400)
  })

  it('returns 400 when permissions is missing', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'Test' })
      .expect(400)
  })

  it('returns 400 when permissions is empty array', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'Test', permissions: [] })
      .expect(400)
  })

  it('returns 400 for invalid permission', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'Test', permissions: ['invalid:permission'] })
      .expect(400)
  })

  it('returns 400 when mcp write permission is missing matching read', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'Write-only MCP', type: 'mcp', permissions: ['mcp.user:write'] })
      .expect(400)

    expect(response.text).toContain('mcp.user:write requires mcp.user:read')
  })

  it('returns 400 when user mcp permissions mix user and admin scopes', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({
        label: 'Mixed MCP',
        type: 'mcp',
        permissions: ['mcp.user:read', 'mcp.admin:read'],
      })
      .expect(400)

    expect(response.text).toContain('api key scopes must not mix audiences')
  })

  it('returns 400 when non-admin user creates admin mcp scopes', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'Admin MCP', type: 'mcp', permissions: ['mcp.admin:read'] })
      .expect(400)

    expect(response.text).toContain('admin mcp scopes require administrator role')
  })

  it('creates API key and returns 201 with api_key and raw_key', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'My RSS Reader', permissions: ['rss:read'] })
      .expect(201)

    expect(response.body.api_key).toBeDefined()
    expect(response.body.api_key.label).toBe('My RSS Reader')
    expect(response.body.api_key.permissions).toEqual(['rss:read'])
    expect(response.body.raw_key).toBeDefined()
    expect(typeof response.body.raw_key).toBe('string')
    expect(response.body.raw_key).toMatch(/^voucha_rss_/)
  })

  it('key appears in GET results after creation', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const createResponse = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'Feed Reader', permissions: ['rss:read'] })
      .expect(201)

    const keyId = createResponse.body.api_key.id
    const listResponse = await request.get('/api/v1/my/api-keys').expect(200)
    const found = listResponse.body.results.find((k: { id: string }) => k.id === keyId)
    expect(found).toBeDefined()
    expect(found.label).toBe('Feed Reader')
  })

  it('returns 400 when mcp key omits mcp.user:read permission', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'Write-only MCP', type: 'mcp', permissions: ['mcp.user:write'] })
      .expect(400)
  })

  it('creates mcp API key and returns 201 with raw_key matching voucha_mcp_ prefix', async () => {
    const request = createRequest()
    await request.authenticateAs(user)

    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({ label: 'My MCP Key', type: 'mcp', permissions: ['mcp.user:read'] })
      .expect(201)

    expect(response.body.raw_key).toMatch(/^voucha_mcp_/)
  })

  it('allows admins to create admin read-only mcp keys', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({
        label: 'Admin MCP Read',
        type: 'mcp',
        permissions: ['mcp.admin:read'],
      })
      .expect(201)

    expect(response.body.api_key.permissions).toEqual(['mcp.admin:read'])
    expect(response.body.raw_key).toMatch(/^voucha_mcp_/)
  })

  it('allows admins to create admin read-write mcp keys', async () => {
    const request = createRequest()
    await request.authenticateAs(admin)

    const response = await request
      .post('/api/v1/my/api-keys')
      .set('Content-Type', 'application/json')
      .send({
        label: 'Admin MCP Read Write',
        type: 'mcp',
        permissions: ['mcp.admin:write', 'mcp.admin:read'],
      })
      .expect(201)

    expect(response.body.api_key.permissions).toEqual(['mcp.admin:read', 'mcp.admin:write'])
    expect(response.body.raw_key).toMatch(/^voucha_mcp_/)
  })
})

describe('DELETE /api/v1/my/api-keys/:id', () => {
  let user: PrivateUser

  beforeAll(async () => {
    user = await createTestUser()
  })
  it('returns 401 when not authenticated', async () => {
    const request = createRequest()
    await request.delete('/api/v1/my/api-keys/00000000-0000-7000-8000-000000000001').expect(401)
  })

  it('returns 422 for non-UUID id', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/my/api-keys/not-a-uuid').expect(422)
  })

  it('returns 404 when key does not exist', async () => {
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete('/api/v1/my/api-keys/00000000-0000-7000-8000-000000000001').expect(404)
  })

  it('returns 204 on successful revoke', async () => {
    const { apiKey } = await createApiKey(user.id, 'rss', 'To Revoke', ['rss:read'])
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/my/api-keys/${apiKey.id}`).expect(204)
  })

  it('returns 404 when revoking another user key', async () => {
    const otherUser = await createTestUser()
    const { apiKey } = await createApiKey(otherUser.id, 'rss', 'Other Key', ['rss:read'])
    const request = createRequest()
    await request.authenticateAs(user)
    await request.delete(`/api/v1/my/api-keys/${apiKey.id}`).expect(404)
  })
})
