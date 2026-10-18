import { beforeAll, describe, expect, it } from 'vitest'
import { createRequest } from '@voucha/test-helpers/api/server'
import { createTestUser, createTestMembership } from '@voucha/test-helpers'
import {
  issueTestOAuthTokensForClient,
  createTestPendingOAuthAuthorization,
} from '@voucha/test-helpers/services/oauth-authorization-server/test-support'
import { createApiKey } from '@services/api-keys'
import { listScopesForAudience } from '@modules/scopes'
import { ALL_TOOLS } from '@voucha/mcp/registry/index'
import { validateOAuthAccessToken } from '@services/oauth-authorization-server/access-tokens'
import { getOAuthResourceMetadataUrl } from '@services/oauth-authorization-server/resources'
import { useCopyrightMcpDecisionTools } from '@voucha/test-helpers/copyright-mcp-write-fixtures'
import { readTestMcpCallAuditEvents } from '@voucha/test-helpers/entities/mcp-call-audit'
import {
  ALL_MCP_SERVER_CONFIGS,
  MOUNTED_MCP_SERVER_CONFIGS,
  type McpServerConfig,
} from './config.mts'

const list = { jsonrpc: '2.0', id: 1, method: 'tools/list' }
function post(config: McpServerConfig, token: string, body: object = list) {
  return createRequest()
    .post(config.routePath)
    .set('Content-Type', 'application/json')
    .set('Authorization', `Bearer ${token}`)
    .send(body)
}
const foreignPairs = MOUNTED_MCP_SERVER_CONFIGS.flatMap(source =>
  MOUNTED_MCP_SERVER_CONFIGS.filter(target => target.audience !== source.audience).map(target => ({
    source,
    target,
  })),
)

describe('MCP server audience isolation through HTTP', () => {
  useCopyrightMcpDecisionTools()
  let user: Awaited<ReturnType<typeof createTestUser>>
  const tokens = new Map<string, string>()
  const keys = new Map<string, string>()
  beforeAll(async () => {
    user = await createTestUser({ administrator: true })
    await createTestMembership({ user_id: user.id, plan: 'plus' })
    for (const config of MOUNTED_MCP_SERVER_CONFIGS) {
      const scopes = listScopesForAudience(config.audience, 'oauth')
      const issued = await issueTestOAuthTokensForClient(user, {
        audience: config.audience,
        scope: scopes.join(' '),
      })
      tokens.set(config.audience, issued.tokens.access_token)
      if (config.acceptsApiKeys) {
        const { rawKey } = await createApiKey(user.id, 'mcp', 'Audience isolation', scopes)
        keys.set(config.audience, rawKey)
      }
    }
  })

  it.each(MOUNTED_MCP_SERVER_CONFIGS)(
    '$audience lists exactly its own eligible tools and audits its audience',
    async config => {
      const response = await post(config, tokens.get(config.audience)!).expect(200)
      expect(response.body.result.tools.map((tool: { name: string }) => tool.name)).toEqual(
        ALL_TOOLS.filter(tool => tool.meta?.audience === config.audience).map(
          tool => tool.schema.name,
        ),
      )
      const correlation = response.headers['x-correlation-id']
      expect(correlation).toBeDefined()
      expect(
        (await readTestMcpCallAuditEvents(user.id)).filter(
          row => row.correlation_id === correlation,
        ),
      ).toEqual([
        expect.objectContaining({
          audience: config.audience,
          jsonrpc_method: 'tools/list',
          outcome: 'accepted',
        }),
      ])
    },
  )

  it.each(foreignPairs)(
    '$source.audience token is rejected by $target.audience',
    async ({ source, target }) => {
      const token = tokens.get(source.audience)!
      const response = await post(target, token).expect(401)
      expect(response.headers['www-authenticate']).toContain('error="invalid_token"')
      expect(response.headers['www-authenticate']).toContain(
        getOAuthResourceMetadataUrl(target.audience),
      )
      // Brand has no mounted endpoint or grants yet; the token verifier still rejects its resource.
      expect(await validateOAuthAccessToken(token, 'brand')).toBeNull()
    },
  )

  it.each(foreignPairs)(
    '$target.audience treats $source.audience tools as unknown',
    async ({ source, target }) => {
      const name = ALL_TOOLS.find(tool => tool.meta?.audience === source.audience)!.schema.name
      const response = await post(target, tokens.get(target.audience)!, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/call',
        params: { name, arguments: {} },
      }).expect(200)
      expect(response.body.error).toEqual({ code: -32601, message: `Tool not found: ${name}` })
      expect(response.headers['www-authenticate']).toBeUndefined()
    },
  )

  it.each(
    MOUNTED_MCP_SERVER_CONFIGS.flatMap(source =>
      ALL_MCP_SERVER_CONFIGS.filter(target => target.audience !== source.audience).map(target => ({
        source,
        target,
      })),
    ),
  )(
    '$target.audience rejects foreign $source.audience scopes at authorization',
    async ({ source, target }) => {
      const scope = listScopesForAudience(source.audience, 'oauth').find(scope =>
        scope.endsWith(':read'),
      )!
      await expect(
        createTestPendingOAuthAuthorization(user, { audience: target.audience, scope }),
      ).rejects.toMatchObject({ code: 'invalid_scope' })
    },
  )

  it.each(['user', 'community_moderation'] as const)(
    '%s keys authenticate only on their own member server',
    async audience => {
      for (const target of MOUNTED_MCP_SERVER_CONFIGS) {
        const response = await post(target, keys.get(audience)!).expect(
          target.audience === audience ? 200 : 401,
        )
        expect(response.status).toBe(target.audience === audience ? 200 : 401)
      }
    },
  )

  it('keeps the brand server unmounted while publishing its empty resource metadata', async () => {
    const brand = ALL_MCP_SERVER_CONFIGS.find(config => config.audience === 'brand')!
    await createRequest().post(brand.routePath).send(list).expect(404)
    const metadata = new URL(getOAuthResourceMetadataUrl('brand')).pathname
    const response = await createRequest().get(metadata).expect(200)
    expect(response.body.scopes_supported).toEqual([])
  })
})
