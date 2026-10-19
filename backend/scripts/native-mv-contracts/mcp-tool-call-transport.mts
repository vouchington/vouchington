import assert from 'node:assert/strict'
import app, { createApiRequestGuardedListener } from '../../api/app.mts'
import { ALL_TOOLS } from '../../mcp/registry/index.mts'
import { ToolRateLimitError } from '../../services/openai-agents/tool-rate-limit-error.mts'
import { USER_MCP_SERVER_CONFIG, handleMcpHttpRequest } from '../../services/mcp-tools/index.mts'
import { withOwnedApiServer } from '../../test-helpers/api-query-options-server.mts'
import { withRequestQueryProfileGuard } from '../../test-helpers/api/request-query-profile-violations.mts'
import { createRequest } from '../../test-helpers/api/server.mts'
import { issueTestUserMcpCredential } from '../../test-helpers/mcp-user-credentials.mts'
import { optionArgs } from '../../test-helpers/mcp-tool-contract.mts'

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
    request: new Request('http://127.0.0.1/api/v1/mcp', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json, text/event-stream',
      },
    }),
    parsedBody: body,
    config: USER_MCP_SERVER_CONFIG,
    rateLimitedCalls,
    onToolCallSettled: () => undefined,
    onToolError: () => Promise.resolve(),
    onToolRateLimited: () => Promise.resolve(),
  })
  assert.equal(response.status, 200)
}

async function postHttpCases(
  request: ReturnType<typeof createRequest>,
  apiKey: string,
  oauth: string,
): Promise<void> {
  const cases: Array<{ token: string; body: unknown; status: number }> = [
    { token: apiKey, body: call, status: 200 },
    {
      token: oauth,
      body: { jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} },
      status: 200,
    },
    { token: apiKey, body: '{ not json', status: 400 },
  ]
  for (const item of cases) {
    await request
      .post('/api/v1/mcp')
      .set('Authorization', `Bearer ${item.token}`)
      .send(item.body)
      .expect(item.status)
  }
}

async function exerciseHttp(): Promise<void> {
  const [apiKey, oauth] = await Promise.all([
    issueTestUserMcpCredential('api_key', 'mcp.user:read'),
    issueTestUserMcpCredential('oauth', 'mcp.user:read mcp.user:write'),
  ])
  await withRequestQueryProfileGuard(() =>
    withOwnedApiServer(createApiRequestGuardedListener(app.callback()), address =>
      postHttpCases(createRequest(address), apiKey.token, oauth.token),
    ),
  )
}

export async function exerciseMcpToolCallTransport(): Promise<void> {
  const tool = ALL_TOOLS.find(candidate => candidate.schema.name === 'discover_topics')
  if (!tool) throw new Error('discover_topics is not registered')
  const original = tool.function
  const phases = [
    async () => {
      tool.function = () => async () => ({ success: true })
      await postTool()
      await postTool(call, new Map([[0, 30]]))
    },
    async () => {
      await exerciseHttp()
    },
    async () => {
      tool.function = () => async () => {
        throw new ToolRateLimitError(1)
      }
      await postTool()
    },
    async () => {
      tool.function = () => async () => {
        throw new Error('native coverage')
      }
      await postTool()
      await postTool({ ...call, params: { name: 'missing_tool', arguments: {} } })
    },
  ]
  try {
    for (const phase of phases) await phase()
  } finally {
    tool.function = original
  }
}
