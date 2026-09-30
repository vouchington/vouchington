import { expect } from 'vitest'
import type { ApiScope } from '../modules/scopes/index.mts'
import { callMcpTool } from '../services/mcp-tools/call-tool.mts'
import { USER_MCP_SERVER_CONFIG } from '../services/mcp-tools/config.mts'
import type { BasicUser } from '../services/users/types.mts'

export type McpContractCaller = BasicUser & { membership_plan: 'plus' | 'pro' | null }

/**
 * Calls a user-surface MCP tool through the real call path, which checks the result against the
 * tool's published output schema. A result the schema rejects becomes an error result, so this
 * fails the test instead of returning. It also pins the text block to the structured content.
 */
export async function callStructuredMcpTool(
  caller: McpContractCaller,
  name: string,
  args: Record<string, unknown>,
  scopes: readonly ApiScope[],
): Promise<Record<string, unknown>> {
  const result = await callMcpTool(name, args, caller, scopes, USER_MCP_SERVER_CONFIG)
  expect(result.isError).toBeUndefined()
  const [block] = result.content as [{ type: 'text'; text: string }]
  expect(result.structuredContent).toEqual(JSON.parse(block.text))
  return result.structuredContent as Record<string, unknown>
}
