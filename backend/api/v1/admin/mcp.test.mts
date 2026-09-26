/**
 * Tests for POST /api/v1/admin/mcp
 *
 * The admin MCP endpoint uses Bearer API-key auth and requires both
 * administrator ownership and admin MCP read permission.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { setTestApiKeyPermissions } from '@voucha/test-helpers/entities/api-keys'
import { createApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'

const MCP_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }
const MCP_INITIALIZED_NOTIFICATION = {
  jsonrpc: '2.0',
  method: 'notifications/initialized',
  params: {},
}

describe('POST /api/v1/admin/mcp', () => {
  let admin: PrivateUser
  let regularUser: PrivateUser
  let adminKey: string
  let userMcpKey: string
  let nonAdminAdminScopeKey: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    regularUser = await createTestUser()
    adminKey = (await createApiKey(admin.id, 'mcp', 'Admin MCP Key', ['mcp.admin:read'])).rawKey
    userMcpKey = (await createApiKey(admin.id, 'mcp', 'User MCP Key', ['mcp.user:read'])).rawKey
    const corruptedKey = await createApiKey(regularUser.id, 'mcp', 'Corrupted Admin MCP Key', [
      'mcp.user:read',
    ])
    await setTestApiKeyPermissions(corruptedKey.apiKey.id, ['mcp.admin:read'])
    nonAdminAdminScopeKey = corruptedKey.rawKey
  })

  it('returns 415 when Content-Type is not application/json', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'text/plain')
      .set('Authorization', `Bearer ${adminKey}`)
      .send('hello')
      .expect(415)
  })

  it('returns 401 when Authorization header is missing', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'application/json')
      .send(MCP_LIST_BODY)
      .expect(401)
  })

  it('returns 401 when a user MCP key is used on the admin endpoint', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${userMcpKey}`)
      .send(MCP_LIST_BODY)
      .expect(401)
  })

  it('returns 403 when the key owner is not an administrator', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${nonAdminAdminScopeKey}`)
      .send(MCP_LIST_BODY)
      .expect(403)
  })

  it('returns 200 with admin tools list for a valid admin key', async () => {
    const req = createRequest()
    const response = await req
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${adminKey}`)
      .send(MCP_LIST_BODY)
      .expect(200)

    const body = response.body as { result?: { tools?: Array<{ name?: string }> } }
    expect(body.result?.tools).toBeDefined()
    expect(body.result?.tools?.map(tool => tool.name)).not.toContain('search_support_messages')
  })

  it('accepts a case-insensitive bearer authorization scheme', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `bearer ${adminKey}`)
      .send(MCP_LIST_BODY)
      .expect(200)
  })

  it('returns 202 with no response body for MCP notifications', async () => {
    const req = createRequest()
    const response = await req
      .post('/api/v1/admin/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${adminKey}`)
      .send(MCP_INITIALIZED_NOTIFICATION)
      .expect(202)

    expect(response.text).toBe('')
  })

  it('returns 405 for GET /api/v1/admin/mcp', async () => {
    const req = createRequest()
    const response = await req.get('/api/v1/admin/mcp').expect(405)
    expect(response.headers['allow']).toContain('POST')
  })

  it('returns 405 for DELETE /api/v1/admin/mcp', async () => {
    const req = createRequest()
    const response = await req.delete('/api/v1/admin/mcp').expect(405)
    expect(response.headers['allow']).toContain('POST')
  })
})
