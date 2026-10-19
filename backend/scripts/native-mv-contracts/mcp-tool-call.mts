import assert from 'node:assert/strict'
import app, { createApiRequestGuardedListener } from '../../api/app.mts'
import '../../api/index.mts'
import { startMcpUsageMeter } from '../../api/mcp-usage-helpers.mts'
import { ALL_TOOLS } from '../../mcp/registry/index.mts'
import {
  createMcpToolCallAnalytics,
  trackMcpToolCall,
  type McpToolCallPlanEvent,
} from '../../services/analytics/mcp-tool-call.mts'
import { ToolRateLimitError } from '../../services/openai-agents/tool-rate-limit-error.mts'
import {
  ADMIN_MCP_SERVER_CONFIG,
  USER_MCP_SERVER_CONFIG,
  handleMcpHttpRequest,
  mcpNotificationShapedToolCall,
  mcpToolCallIsDispatched,
} from '../../services/mcp-tools/index.mts'
import { withOwnedApiServer } from '../../test-helpers/api-query-options-server.mts'
import { withRequestQueryProfileGuard } from '../../test-helpers/api/request-query-profile-violations.mts'
import { createRequest } from '../../test-helpers/api/server.mts'
import { issueTestUserMcpCredential } from '../../test-helpers/mcp-user-credentials.mts'
import { optionArgs } from '../../test-helpers/mcp-tool-contract.mts'

// This process's native V8 coverage counts every loaded line. Vitest runs the same functions, but
// its map omits lines inside multi-line calls, so the gate stays red unless this process runs them.
const dispatch = {
  isDispatched: mcpToolCallIsDispatched,
  isNotification: mcpNotificationShapedToolCall,
}

function plan(outcome: McpToolCallPlanEvent['outcome'] = 'accepted'): McpToolCallPlanEvent {
  return { jsonrpcMethod: 'tools/call', toolName: 'discover_topics', outcome }
}

function exerciseAnalytics(): void {
  trackMcpToolCall({
    audience: 'user',
    credential: 'api_key',
    user_id: crypto.randomUUID(),
    api_key_id: crypto.randomUUID(),
    oauth_client_id: null,
    oauth_grant_id: null,
    plan: 'free',
    request_event_id: crypto.randomUUID(),
    batch_size: 1,
    batch_index: 0,
    tool: 'discover_topics',
    option: 'search',
    jsonrpc_method: 'tools/call',
    outcome: 'accepted',
    duration_ms: 1,
  })
  const analytics = createMcpToolCallAnalytics(
    {
      audience: 'brand',
      credential: 'oauth',
      userId: crypto.randomUUID(),
      apiKeyId: null,
      oauthClientId: 'native-mv',
      oauthGrantId: crypto.randomUUID(),
      plan: 'plus',
    },
    dispatch,
  )
  const missing = undefined as unknown as McpToolCallPlanEvent
  analytics.recordCalls(
    [plan(), missing, plan('insufficient_scope')],
    [{ method: 'tools/call' }, { method: 'tools/call', id: 2 }, { method: 'tools/call', id: 3 }],
    false,
  )
  analytics.recordCalls(
    [plan(), plan()],
    [{ method: 'tools/call', id: 4 }, { method: 'tools/call' }],
    true,
  )
  analytics.settleDispatchedCall(0, { durationMs: 5, toolError: false, rateLimited: true })
  analytics.settleDispatchedCall(9, { durationMs: null, toolError: true, rateLimited: false })
  analytics.recordCalls([plan()], [{ method: 'tools/call', id: 5 }], true)
  analytics.settleDispatchedCall(0, { durationMs: 8, toolError: true, rateLimited: false })
}

function exerciseMeters(): void {
  const owner = { id: crypto.randomUUID(), membership_plan: 'pro' as const }
  const ctx = {
    req: { url: 'http://127.0.0.1/api/v1/mcp' },
    res: { once() {}, statusCode: 200 },
  } as unknown as Parameters<typeof startMcpUsageMeter>[0]
  startMcpUsageMeter(ctx, USER_MCP_SERVER_CONFIG, {
    status: 'authenticated',
    credential: 'api_key',
    apiKeyId: crypto.randomUUID(),
    owner,
    scopes: ['topics:read'],
    suspended: false,
    rateLimitIdentity: { userId: owner.id },
  } as never)
  startMcpUsageMeter(ctx, ADMIN_MCP_SERVER_CONFIG, {
    status: 'authenticated',
    credential: 'oauth',
    oauthClientId: 'native-mv',
    oauthGrantId: crypto.randomUUID(),
    oauthClientRowId: crypto.randomUUID(),
    owner,
    scopes: ['topics:read'],
    suspended: false,
    rateLimitIdentity: { userId: owner.id },
  } as never)
}

const caller = {
  __entity_type: 'user' as const,
  id: crypto.randomUUID(),
  roles: ['user'],
  account_type: null,
  membership_plan: null,
}
const call = {
  jsonrpc: '2.0',
  id: 2,
  method: 'tools/call',
  params: {
    name: 'discover_topics',
    arguments: optionArgs('search', { text_search_query: 'a' }),
  },
}

async function postTool(
  body: unknown = call,
  rateLimitedCalls: ReadonlyMap<number, number> = new Map(),
): Promise<void> {
  const response = await handleMcpHttpRequest({
    user: caller,
    permissions: ['mcp.user:read'],
    request: new Request('http://127.0.0.1/api/v1/mcp', { method: 'POST' }),
    parsedBody: body,
    config: USER_MCP_SERVER_CONFIG,
    rateLimitedCalls,
    onToolCallSettled: () => undefined,
    onToolError: () => Promise.resolve(),
    onToolRateLimited: () => Promise.resolve(),
  })
  assert.equal(response.status, 200)
}

async function exerciseHttp(): Promise<void> {
  const apiKey = await issueTestUserMcpCredential('api_key', 'mcp.user:read')
  const oauth = await issueTestUserMcpCredential('oauth', 'mcp.user:read mcp.user:write')
  await withRequestQueryProfileGuard(() =>
    withOwnedApiServer(createApiRequestGuardedListener(app.callback()), async address => {
      const request = createRequest(address)
      await request
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${apiKey.token}`)
        .send(call)
        .expect(200)
      await request
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${oauth.token}`)
        .send({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} })
        .expect(200)
      await request
        .post('/api/v1/mcp')
        .set('Authorization', `Bearer ${apiKey.token}`)
        .send('{ not json')
        .expect(400)
    }),
  )
}

export async function checkMcpToolCallContracts(): Promise<void> {
  exerciseAnalytics()
  exerciseMeters()
  mcpToolCallIsDispatched({ method: 'tools/call', id: 1 })
  mcpToolCallIsDispatched({ method: 'tools/call' })
  mcpNotificationShapedToolCall(null)
  mcpNotificationShapedToolCall({ method: 'tools/call', id: null })
  mcpNotificationShapedToolCall({ method: 'tools/list', id: 1 })
  const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'discover_topics')
  if (!tool) throw new Error('discover_topics is not registered')
  const original = tool.function
  try {
    tool.function = () => async () => ({ success: true })
    await postTool()
    await postTool(call, new Map([[0, 30]]))
    await exerciseHttp()
    tool.function = () => async () => {
      throw new ToolRateLimitError(1)
    }
    await postTool()
    tool.function = () => async () => {
      throw new Error('native coverage')
    }
    await postTool()
    await postTool({ ...call, params: { name: 'missing_tool', arguments: {} } })
  } finally {
    tool.function = original
  }
}
