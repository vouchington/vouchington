import { describe, expect, it } from 'vitest'
import { createTestUser } from '@voucha/test-helpers'
import { createApiKey } from '@services/api-keys'
import {
  deleteTestMcpCallAuditEvents,
  readTestMcpCallAuditEvents,
  updateTestMcpCallAuditOutcomes,
} from '@voucha/test-helpers/entities/mcp-call-audit'
import { getOAuthResourceUrl } from '@services/oauth-authorization-server'
import { issueTestOAuthTokensForClient } from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { createMcpCallAuditContext, recordMcpCallAudit } from './audit.mts'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from './config.mts'

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/

const oauth = (oauthClientId: string) => ({ credential: 'oauth', oauthClientId }) as const
const apiKey = (apiKeyId: string) => ({ credential: 'api_key', apiKeyId }) as const

async function registerActor() {
  const user = await createTestUser({ administrator: true })
  const { clientId } = await issueTestOAuthTokensForClient(user, {
    audience: 'admin',
    scope: 'mcp.admin:read',
  })
  return { user, clientId }
}

describe('createMcpCallAuditContext', () => {
  it('binds the surface, actor, client and protected resource to a fresh correlation id', () => {
    const first = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, 'actor', oauth('client'))
    const second = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, 'actor', oauth('client'))

    expect(first).toMatchObject({
      surface: 'admin_mcp',
      actorUserId: 'actor',
      credential: { credential: 'oauth', oauthClientId: 'client' },
      resource: getOAuthResourceUrl('admin'),
    })
    expect(first.correlationId).toMatch(UUID_PATTERN)
    expect(second.correlationId).not.toBe(first.correlationId)
  })

  it('binds the user surface and the key id for an API-key credential', () => {
    const context = createMcpCallAuditContext(USER_MCP_SERVER_CONFIG, 'actor', apiKey('key'))

    expect(context).toMatchObject({
      surface: 'mcp',
      actorUserId: 'actor',
      credential: { credential: 'api_key', apiKeyId: 'key' },
      resource: getOAuthResourceUrl('user'),
    })
  })

  it('keeps only the credential identifier, never the rest of the authentication result', () => {
    const authentication = {
      credential: 'api_key',
      apiKeyId: 'key',
      rawKey: 'voucha_mcp_secret',
      scopes: ['mcp.user:read'],
    } as const

    const context = createMcpCallAuditContext(USER_MCP_SERVER_CONFIG, 'actor', authentication)

    expect(JSON.stringify(context)).not.toContain('voucha_mcp_secret')
    expect(context.credential).toEqual({ credential: 'api_key', apiKeyId: 'key' })
  })
})

describe('recordMcpCallAudit', () => {
  it('stores one row per event in order under a single correlation id', async () => {
    const { user, clientId } = await registerActor()
    const context = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, user.id, oauth(clientId))

    await recordMcpCallAudit(context, [
      { jsonrpcMethod: 'tools/list', toolName: null, outcome: 'accepted' },
      { jsonrpcMethod: 'tools/call', toolName: 'a_tool', outcome: 'insufficient_scope' },
      { jsonrpcMethod: null, toolName: null, outcome: 'invalid_request' },
    ])

    const events = await readTestMcpCallAuditEvents(user.id)
    expect(events.map(event => [event.jsonrpc_method, event.tool_name, event.outcome])).toEqual([
      ['tools/list', null, 'accepted'],
      ['tools/call', 'a_tool', 'insufficient_scope'],
      [null, null, 'invalid_request'],
    ])
    expect(events.every(event => event.correlation_id === context.correlationId)).toBe(true)
    expect(events.every(event => event.oauth_client_id === clientId)).toBe(true)
    expect(events.every(event => event.api_key_id === null)).toBe(true)
    expect(events.every(event => event.resource === context.resource)).toBe(true)
    // The timestamp is derived from the UUIDv7 id, so it is the write time.
    expect(Math.abs(Date.now() - events[0]!.occurred_at.getTime())).toBeLessThan(60_000)
  })

  it('writes nothing for an empty event list', async () => {
    const { user, clientId } = await registerActor()

    await recordMcpCallAudit(
      createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, user.id, oauth(clientId)),
      [],
    )

    await expect(readTestMcpCallAuditEvents(user.id)).resolves.toEqual([])
  })

  it('throws and stores nothing when the OAuth client is unknown', async () => {
    const { user } = await registerActor()
    const context = createMcpCallAuditContext(
      ADMIN_MCP_SERVER_CONFIG,
      user.id,
      oauth('unknown-client'),
    )

    await expect(
      recordMcpCallAudit(context, [{ jsonrpcMethod: 'ping', toolName: null, outcome: 'accepted' }]),
    ).rejects.toThrow('MCP call audit was not recorded')

    await expect(readTestMcpCallAuditEvents(user.id)).resolves.toEqual([])
  })

  it('stores an API-key call identified by the key id with no OAuth client', async () => {
    const user = await createTestUser()
    const { apiKey: key } = await createApiKey(user.id, 'mcp', 'Audited key', ['mcp.user:read'])
    const context = createMcpCallAuditContext(USER_MCP_SERVER_CONFIG, user.id, apiKey(key.id))

    await recordMcpCallAudit(context, [
      { jsonrpcMethod: 'tools/list', toolName: null, outcome: 'accepted' },
      { jsonrpcMethod: 'tools/call', toolName: 'a_tool', outcome: 'insufficient_scope' },
    ])

    const events = await readTestMcpCallAuditEvents(user.id)
    expect(events).toEqual([
      expect.objectContaining({
        surface: 'mcp',
        api_key_id: key.id,
        oauth_client_id: null,
        correlation_id: context.correlationId,
        resource: getOAuthResourceUrl('user'),
      }),
      expect.objectContaining({ api_key_id: key.id, oauth_client_id: null }),
    ])
  })

  it('throws and stores nothing when the API key has no retained identity', async () => {
    const user = await createTestUser()
    const context = createMcpCallAuditContext(
      USER_MCP_SERVER_CONFIG,
      user.id,
      apiKey('019e0000-0000-7000-8000-000000000000'),
    )

    await expect(
      recordMcpCallAudit(context, [{ jsonrpcMethod: 'ping', toolName: null, outcome: 'accepted' }]),
    ).rejects.toMatchObject({ code: '23503' })

    await expect(readTestMcpCallAuditEvents(user.id)).resolves.toEqual([])
  })

  it('rejects an outcome outside the recorded set', async () => {
    const { user, clientId } = await registerActor()
    const context = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, user.id, oauth(clientId))

    await expect(
      recordMcpCallAudit(context, [
        // @ts-expect-error -- exercising the database CHECK with a value the type forbids
        { jsonrpcMethod: 'ping', toolName: null, outcome: 'whatever' },
      ]),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('rejects a tool name on a method other than tools/call', async () => {
    const { user, clientId } = await registerActor()
    const context = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, user.id, oauth(clientId))

    await expect(
      recordMcpCallAudit(context, [
        { jsonrpcMethod: 'tools/list', toolName: 'a_tool', outcome: 'accepted' },
      ]),
    ).rejects.toMatchObject({ code: '23514' })
  })

  it('keeps recorded rows immutable', async () => {
    const { user, clientId } = await registerActor()
    const context = createMcpCallAuditContext(ADMIN_MCP_SERVER_CONFIG, user.id, oauth(clientId))
    await recordMcpCallAudit(context, [
      { jsonrpcMethod: 'tools/list', toolName: null, outcome: 'rate_limited' },
    ])

    await expect(updateTestMcpCallAuditOutcomes(user.id)).rejects.toMatchObject({ code: '23514' })
    await expect(deleteTestMcpCallAuditEvents(user.id)).rejects.toMatchObject({ code: '23514' })

    expect((await readTestMcpCallAuditEvents(user.id)).map(event => event.outcome)).toEqual([
      'rate_limited',
    ])
  })
})
