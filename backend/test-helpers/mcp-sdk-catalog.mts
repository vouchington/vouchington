import { expect } from 'vitest'
import { SCOPE_DEFINITIONS, type ApiScope } from '../modules/scopes/index.mts'
import {
  runWithCredentialRequestContext,
  type CredentialRequestOrigin,
} from '../modules/request-client-info/index.mts'
import { findSchemaViolation } from '../mcp/schema-validator.mts'
import {
  ADMIN_MCP_SERVER_CONFIG,
  USER_MCP_SERVER_CONFIG,
  COMMUNITY_MODERATION_MCP_SERVER_CONFIG,
  LEGAL_MCP_SERVER_CONFIG,
} from '../services/mcp-tools/config.mts'
import { handleMcpHttpRequest } from '../services/mcp-tools/handle-request.mts'
import { createTestMembership } from './entities/memberships.mts'
import { createTestUser } from './entities/users.mts'
import { randomTestOAuthRedirectUri } from './services/oauth-authorization-server/test-support.mts'
import {
  registerOAuthClient,
  getOAuthClient,
} from '../services/oauth-authorization-server/index.mts'

const preModerationScopes = (Object.keys(SCOPE_DEFINITIONS) as ApiScope[]).filter(
  scope => scope !== 'community-moderation:read' && scope !== 'community-moderation:write',
)
const readerScopes: ApiScope[] = [
  'topics:read',
  'posts:read',
  'rss-feeds:read',
  'rss-feed-items:read',
  'feeds:read',
  'reference-data:read',
]
export const sdkCatalogCases = [
  {
    server: USER_MCP_SERVER_CONFIG,
    grant: 'all',
    scopes: preModerationScopes,
    plan: 'pro',
    admin: true,
    count: 78,
  },
  {
    server: USER_MCP_SERVER_CONFIG,
    grant: 'Reader',
    scopes: readerScopes,
    plan: null,
    admin: false,
    count: 9,
  },
  {
    server: USER_MCP_SERVER_CONFIG,
    grant: 'Reviewer',
    scopes: ['moderation:read'] as ApiScope[],
    plan: null,
    admin: true,
    count: 0,
  },
  {
    server: ADMIN_MCP_SERVER_CONFIG,
    grant: 'all',
    scopes: preModerationScopes,
    plan: 'pro',
    admin: true,
    count: 53,
  },
  {
    server: ADMIN_MCP_SERVER_CONFIG,
    grant: 'Reader',
    scopes: readerScopes,
    plan: null,
    admin: false,
    count: 0,
  },
  {
    server: ADMIN_MCP_SERVER_CONFIG,
    grant: 'Reviewer',
    scopes: ['moderation:read'] as ApiScope[],
    plan: null,
    admin: true,
    count: 8,
  },
  {
    server: LEGAL_MCP_SERVER_CONFIG,
    grant: 'all',
    scopes: ['copyright-notices:read', 'copyright-notices:write'] as ApiScope[],
    plan: null,
    admin: true,
    count: 22,
  },
] as const

export const sdkCommunityModerationCase = {
  server: COMMUNITY_MODERATION_MCP_SERVER_CONFIG,
  grant: 'Community moderator',
  scopes: ['community-moderation:read', 'community-moderation:write'] as ApiScope[],
  plan: 'plus',
  admin: false,
  count: 4,
} as const

export async function connectSdkCatalog<T>(
  testCase: (typeof sdkCatalogCases)[number] | typeof sdkCommunityModerationCase,
  account: Awaited<ReturnType<typeof createTestUser>> | undefined,
  makeClient: (
    url: URL,
    fetch: (input: Request | string | URL, init?: RequestInit) => Promise<Response>,
  ) => Promise<T>,
): Promise<T> {
  const owner = account ?? (await createTestUser({ administrator: testCase.admin }))
  if (testCase.plan !== null) await createTestMembership({ user_id: owner.id, plan: testCase.plan })
  const user = { ...owner, membership_plan: testCase.plan }
  // This SDK harness enters verified dispatch directly so it can vary caller roles independently
  // of OAuth grant admission. A real registered client supplies staff content provenance.
  const client = testCase.server.acceptsApiKeys
    ? null
    : await registerOAuthClient({
        client_name: 'MCP SDK contract',
        redirect_uris: [randomTestOAuthRedirectUri()],
        scope: testCase.server.audience === 'legal' ? 'copyright-notices:read' : 'mcp.admin:read',
      })
  const origin: CredentialRequestOrigin = client
    ? {
        interface: 'mcp',
        credential: 'oauth',
        client: null,
        oauthClientId: (await getOAuthClient(client.client_id))!.id,
      }
    : { interface: 'mcp', credential: 'api_key', client: null, oauthClientId: null }
  return makeClient(
    new URL(`http://localhost${testCase.server.routePath}`),
    async (input, init) => {
      const request = new Request(input, init)
      if (request.method !== 'POST') return new Response(null, { status: 405 })
      const parsedBody: unknown = await request.clone().json()
      return runWithCredentialRequestContext(origin, () =>
        handleMcpHttpRequest({
          request,
          parsedBody,
          user,
          permissions: testCase.scopes,
          config: testCase.server,
          copyrightDecisionToolsEnabled: true,
          rateLimitedCalls: new Map(),
        }),
      )
    },
  )
}

type CatalogSdk = {
  listTools(): Promise<{
    tools: Array<{ name: string; outputSchema?: Parameters<typeof findSchemaViolation>[0] }>
  }>
  callTool(input: { name: string; arguments: Record<string, unknown> }): Promise<
    | {
        content: Array<{ type: string; text?: string }>
        isError?: boolean
        structuredContent?: unknown
      }
    | { toolResult: unknown }
  >
}

/** Snapshot this fixed caller's advertised schemas; every invocation still uses the real client. */
export async function createSdkCatalogAssertions(client: CatalogSdk) {
  const { tools } = await client.listTools()
  return { tools, callAndValidate }

  async function callAndValidate(
    name: string,
    option: string | null,
    args: Record<string, unknown>,
  ) {
    const advertised = tools.find(tool => tool.name === name)
    expect(advertised?.outputSchema).toBeDefined()
    const result = await client.callTool({
      name,
      arguments: option === null ? args : { option, arguments: args },
    })
    if (!('content' in result)) throw new Error('Expected a normal SDK tool result')
    expect(result.isError).toBeUndefined()
    expect(result.structuredContent).toBeDefined()
    expect(findSchemaViolation(advertised!.outputSchema!, result.structuredContent)).toBeNull()
    const first = result.content[0]
    expect(first).toMatchObject({ type: 'text' })
    if (first?.type !== 'text' || first.text === undefined)
      throw new Error('Expected the structured result text companion')
    expect(JSON.parse(first.text)).toEqual(result.structuredContent)
    return result.structuredContent
  }
}
