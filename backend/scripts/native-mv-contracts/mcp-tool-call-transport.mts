import assert from 'node:assert/strict'
import { ALL_TOOLS } from '../../mcp/registry/index.mts'
import { ToolRateLimitError } from '../../services/openai-agents/tool-rate-limit-error.mts'
import { USER_MCP_SERVER_CONFIG, handleMcpHttpRequest } from '../../services/mcp-tools/index.mts'
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
