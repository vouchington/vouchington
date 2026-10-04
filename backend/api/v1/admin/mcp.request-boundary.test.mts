/**
 * Parser-boundary tests for POST /api/v1/admin/mcp.
 *
 * This endpoint is specialized ingress: the body is a JSON-RPC message that the MCP SDK parses and
 * validates, so the shared `validateRequestContract` adapter (422 with schema diagnostics) is
 * intentionally absent. These tests pin that boundary: unauthenticated callers never learn about
 * parser diagnostics, and authenticated callers get JSON-RPC errors instead of a schema 422.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser } from '@voucha/test-helpers'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import type { PrivateUser } from '@services/users/types'

function postRaw(token: string | null, payload: string) {
  const request = createRequest().post('/api/v1/admin/mcp').set('Content-Type', 'application/json')
  if (token) request.set('Authorization', `Bearer ${token}`)
  return request.send(payload)
}

describe('POST /api/v1/admin/mcp request boundary', () => {
  let admin: PrivateUser
  let token: string

  beforeAll(async () => {
    admin = await createTestUser({ administrator: true })
    const issued = await issueTestOAuthTokensForClient(admin, {
      audience: 'admin',
      scope: 'mcp.admin:read',
    })
    token = issued.tokens.access_token
  })

  it.each(['{"jsonrpc":', '{"hello":"world"}', 'null'])(
    'keeps 401 without a schema diagnostic for the unauthenticated payload %s',
    async payload => {
      const response = await postRaw(null, payload).expect(401)

      expect(JSON.stringify(response.body)).not.toMatch(/schema|jsonrpc|parse/i)
      await expect(readTestMcpCallAuditEvents(admin.id)).resolves.toEqual([])
    },
  )

  it('answers authenticated malformed JSON with the body reader 400, not a schema 422', async () => {
    const response = await postRaw(token, '{"jsonrpc":').expect(400)

    expect(response.body).toMatchObject({ message: 'Invalid JSON' })
    expect(response.body).not.toHaveProperty('errors')
  })

  it('answers an authenticated non-JSON-RPC object with a JSON-RPC error, not a schema 422', async () => {
    const response = await postRaw(token, '{"hello":"world"}')

    expect(response.status).toBe(400)
    expect(response.body).toMatchObject({
      jsonrpc: '2.0',
      id: null,
      error: { code: expect.any(Number) },
    })
  })
})
