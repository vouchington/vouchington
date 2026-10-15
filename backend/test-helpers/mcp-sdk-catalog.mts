import { expect } from 'vitest'
import { SCOPE_DEFINITIONS, type ApiScope } from '../modules/scopes/index.mts'
import {
  runWithCredentialRequestContext,
  type CredentialRequestOrigin,
} from '../modules/request-client-info/index.mts'
import { findSchemaViolation } from '../mcp/schema-validator.mts'
import { ADMIN_MCP_SERVER_CONFIG, USER_MCP_SERVER_CONFIG } from '../services/mcp-tools/config.mts'
import { handleMcpHttpRequest } from '../services/mcp-tools/handle-request.mts'
import { createTestMembership } from './entities/memberships.mts'
import { createTestUser } from './entities/users.mts'
import { issueTestOAuthTokensForClient } from './services/oauth-authorization-server/test-support.mts'

export const allScopes = Object.keys(SCOPE_DEFINITIONS) as ApiScope[]
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
    scopes: allScopes,
    plan: 'pro',
    admin: true,
    count: 69,
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
    scopes: allScopes,
    plan: 'pro',
    admin: true,
    count: 75,
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
] as const

export async function connectSdkCatalog<T>(
  testCase: (typeof sdkCatalogCases)[number],
  account: Awaited<ReturnType<typeof createTestUser>> | undefined,
  makeClient: (
    url: URL,
    fetch: (input: Request | string | URL, init?: RequestInit) => Promise<Response>,
  ) => Promise<T>,
): Promise<T> {
  const owner = account ?? (await createTestUser({ administrator: testCase.admin }))
  if (testCase.plan === 'pro') await createTestMembership({ user_id: owner.id, plan: 'pro' })
  const user = { ...owner, membership_plan: testCase.plan }
  const origin: CredentialRequestOrigin =
    testCase.server.surface === 'mcp' || !testCase.admin
      ? { interface: 'mcp', credential: 'api_key', client: null, oauthClientId: null }
      : {
          interface: 'mcp',
          credential: 'oauth',
          client: null,
          oauthClientId: (
            await issueTestOAuthTokensForClient(owner, {
              audience: 'admin',
              scope: 'mcp.admin:read',
            })
          ).clientId,
        }
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

export async function callAndValidateSdkTool(
  client: unknown,
  name: string,
  option: string | null,
  args: Record<string, unknown>,
) {
  const sdk = client as {
    listTools: () => Promise<{
      tools: Array<{ name: string; outputSchema?: Parameters<typeof findSchemaViolation>[0] }>
    }>
    callTool: (input: { name: string; arguments: Record<string, unknown> }) => Promise<{
      isError?: boolean
      structuredContent?: unknown
      content: unknown
    }>
  }
  const advertised = (await sdk.listTools()).tools.find(tool => tool.name === name)
  expect(advertised?.outputSchema).toBeDefined()
  const result = await sdk.callTool({
    name,
    arguments: option === null ? args : { option, arguments: args },
  })
  expect(result.isError).toBeUndefined()
  expect(result.structuredContent).toBeDefined()
  expect(findSchemaViolation(advertised!.outputSchema!, result.structuredContent)).toBeNull()
  const first = (result.content as Array<{ type: string; text?: string }>)[0]
  expect(first).toMatchObject({ type: 'text' })
  if (first?.type !== 'text' || first.text === undefined)
    throw new Error('Expected the structured result text companion')
  expect(JSON.parse(first.text)).toEqual(result.structuredContent)
  return result.structuredContent
}
