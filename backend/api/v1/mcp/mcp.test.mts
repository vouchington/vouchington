/**
 * Tests for POST /api/v1/mcp
 *
 * The MCP endpoint uses Bearer API-key auth (not session cookies).
 * We use real DB/Valkey and real API keys, mocking nothing.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/api/test-helpers/server'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import type { PrivateUser } from '@services/users/types'

const MCP_LIST_BODY = { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }

describe('POST /api/v1/mcp', () => {
  let user: PrivateUser
  let validKey: string

  beforeAll(async () => {
    user = await createTestUser()
    const { rawKey } = await createApiKey(user.id, 'mcp', 'Test MCP Key', ['mcp-tools:read'])
    validKey = rawKey
  })

  it('returns 415 when Content-Type is not application/json', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'text/plain')
      .set('Authorization', `Bearer ${validKey}`)
      .send('hello')
      .expect(415)
  })

  it('returns 401 when Authorization header is missing', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .send(MCP_LIST_BODY)
      .expect(401)
  })

  it('returns 401 when Authorization is not Bearer format', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Basic dXNlcjpwYXNz')
      .send(MCP_LIST_BODY)
      .expect(401)
  })

  it('returns 401 when API key is invalid', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', 'Bearer voucha_mcp_00000000000000000000000000000000_0000000000000000')
      .send(MCP_LIST_BODY)
      .expect(401)
  })

  it('returns 200 with tools list for valid key', async () => {
    const req = createRequest()
    const response = await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${validKey}`)
      .send(MCP_LIST_BODY)
      .expect(200)

    const body = response.body as { result?: { tools?: unknown[] } }
    expect(Array.isArray(body.result?.tools)).toBe(true)
  })

  it('accepts a case-insensitive bearer authorization scheme', async () => {
    const req = createRequest()
    await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `bearer ${validKey}`)
      .send(MCP_LIST_BODY)
      .expect(200)
  })

  it('does not expose admin MCP tools on the user MCP endpoint', async () => {
    const req = createRequest()
    const response = await req
      .post('/api/v1/mcp')
      .set('Content-Type', 'application/json')
      .set('Authorization', `Bearer ${validKey}`)
      .send(MCP_LIST_BODY)
      .expect(200)

    const body = response.body as { result?: { tools?: Array<{ name?: string }> } }
    expect(body.result?.tools?.map(tool => tool.name)).not.toContain('search_support_messages')
  })

  it('returns 405 for GET /api/v1/mcp', async () => {
    const req = createRequest()
    const response = await req.get('/api/v1/mcp').expect(405)
    expect(response.headers['allow']).toContain('POST')
  })

  it('returns 405 for DELETE /api/v1/mcp', async () => {
    const req = createRequest()
    const response = await req.delete('/api/v1/mcp').expect(405)
    expect(response.headers['allow']).toContain('POST')
  })
})
