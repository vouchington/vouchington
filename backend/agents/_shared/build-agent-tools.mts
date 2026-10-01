import { assertToolAllowedForUser, type AgentTool } from '@services/openai-agents'
import type { BasicUser } from '@services/users/types'
import type { Tool, ToolCallOutput, ToolInvocationContext } from '@voucha/tools'

type ToolExecutor = (
  args: never,
  invocationContext?: ToolInvocationContext,
) => Promise<unknown> | unknown

type DispatchableTool = {
  schema: Tool['schema']
  function: (currentUser: BasicUser, ...curry: readonly never[]) => ToolExecutor
  formatResult?: (callId: string, result: never) => ToolCallOutput
  roles?: Tool['roles']
  meta?: Tool['meta']
}

type CurriedToolEntry = { tool: DispatchableTool; curryArgs: readonly unknown[] }

export type AgentToolEntry = DispatchableTool | CurriedToolEntry

function isToolEntry(entry: AgentToolEntry): entry is CurriedToolEntry {
  return 'tool' in entry && 'curryArgs' in entry
}

/**
 * Converts an array of Tool definitions into AgentTool[] ready for executeToolCalls.
 *
 * Eliminates the per-tool boilerplate of:
 *   { schema: tool.schema, executor: tool.function(currentUser) }
 *
 * @example Basic usage:
 *   const { agentTools } = buildAgentTools(currentUser, [
 *     searchPostsTool,
 *     searchRssFeedItemsTool,
 *   ])
 *
 */
export function buildAgentTools(
  currentUser: BasicUser,
  entries: readonly AgentToolEntry[],
): { agentTools: AgentTool[] } {
  return {
    agentTools: entries.map(entry =>
      isToolEntry(entry)
        ? bindAgentTool(currentUser, entry.tool, entry.curryArgs)
        : bindAgentTool(currentUser, entry, []),
    ),
  }
}

function bindAgentTool(
  currentUser: BasicUser,
  tool: DispatchableTool,
  curryArgs: readonly unknown[],
): AgentTool {
  assertToolAllowedForUser(tool, currentUser)
  const formatResult = tool.formatResult
  return {
    schema: tool.schema,
    executor: tool.function(currentUser, ...(curryArgs as readonly never[])),
    ...(formatResult ? { formatResult } : {}),
  }
}

/**
 * Extracts OpenAI-shaped tool schemas from an AgentTool array.
 * The cast is required because AgentTool.schema is structurally
 * correct but too loosely typed to satisfy the OpenAI Responses API's tools parameter.
 */
export function agentToolsToSchemas(tools: AgentTool[]): unknown {
  return tools.map(t => t.schema)
}
