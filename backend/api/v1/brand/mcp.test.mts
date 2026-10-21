import { describe, expect, it } from 'vitest'
import { LATEST_PROTOCOL_VERSION } from '@modelcontextprotocol/sdk/types.js'
import { createApiKey } from '@services/api-keys'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, suspendTestUser } from '@voucha/test-helpers'

const SCOPES = ['topic-claims:read', 'topic-claims:write'] as const

function post(key: string, body: object) {
  return createRequest()
    .post('/api/v1/brand/mcp')
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${key}`)
    .send(body)
}

describe('POST /api/v1/brand/mcp', () => {
  it('initializes, lists the two topic-claim tools, and lists the caller’s claims', async () => {
    const user = await createTestUser()
    const { rawKey } = await createApiKey(user.id, 'mcp', 'Brand MCP', SCOPES)
    const initialized = await post(rawKey, {
      jsonrpc: '2.0',
      id: 1,
      method: 'initialize',
      params: {
        protocolVersion: LATEST_PROTOCOL_VERSION,
        capabilities: {},
        clientInfo: { name: 'brand-mcp-test', version: '1.0.0' },
      },
    }).expect(200)
    expect(initialized.body.result.instructions).toContain('never by the agent')

    const listed = await post(rawKey, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/list',
      params: {},
    }).expect(200)
    expect(listed.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual([
      'read_my_topic_claims',
      'manage_topic_claim',
    ])

    const called = await post(rawKey, {
      jsonrpc: '2.0',
      id: 3,
      method: 'tools/call',
      params: {
        name: 'read_my_topic_claims',
        arguments: { option: 'list', arguments: {} },
      },
    }).expect(200)
    expect(called.body.result.structuredContent).toEqual({ claims: [] })
  })

  it('rejects a suspended brand caller at authentication', async () => {
    const user = await createTestUser()
    const { rawKey } = await createApiKey(user.id, 'mcp', 'Suspended brand', SCOPES)
    await suspendTestUser(user.id)
    await post(rawKey, { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }).expect(401)
  })
})
