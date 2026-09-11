import { assertToolAllowedForUser, type AgentTool } from '@services/openai-agents'
import type { BasicUser } from '@services/users/types'
import type { Tool } from '@voucha/tools'

export type AgentToolEntry =
  | Tool<any, any>
  | { tool: Tool<any, any, readonly any[]>; curryArgs: readonly any[] }

/**
 * Type-safe helper for binding curry args to a tool.
 * Variadic tuple inference enforces curryArgs match the tool's TCurry parameter
 * at compile time, so callers no longer need `as never` casts.
 *
 * @example
 *   buildAgentTools(currentUser, [
 *     searchPostsTool,
 *     withCurry(addRelatedTopicTool, entityType, entityId),
 *   ])
 */
export function withCurry<TArgs, TResult, TCurry extends readonly unknown[]>(
  tool: Tool<TArgs, TResult, TCurry>,
  ...curryArgs: TCurry
): { tool: Tool<TArgs, TResult, TCurry>; curryArgs: TCurry } {
  return { tool, curryArgs }
}

function isToolEntry(
  entry: AgentToolEntry,
): entry is { tool: Tool<any, any, readonly any[]>; curryArgs: readonly any[] } {
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
 * @example Tool with extra curry args (e.g. add-related-topic):
 *   const { agentTools } = buildAgentTools(currentUser, [
 *     withCurry(addRelatedTopicTool, entityType, entityId),
 *   ])
 */
export function buildAgentTools(
  currentUser: BasicUser,
  entries: AgentToolEntry[],
): { agentTools: AgentTool[] } {
  const agentTools: AgentTool[] = entries.map(entry => {
    if (isToolEntry(entry)) {
      const { tool, curryArgs } = entry
      assertToolAllowedForUser(tool, currentUser)
      const executor = tool.function(currentUser, ...curryArgs)
      return {
        schema: tool.schema,
        executor,
        ...(tool.formatResult && { formatResult: tool.formatResult }),
      }
    }

    const tool = entry
    assertToolAllowedForUser(tool, currentUser)
    return {
      schema: tool.schema,
      executor: tool.function(currentUser),
      ...(tool.formatResult && { formatResult: tool.formatResult }),
    }
  })

  return { agentTools }
}

/**
 * Extracts OpenAI-shaped tool schemas from an AgentTool array.
 * The cast is required because AgentTool.schema is structurally
 * correct but too loosely typed to satisfy the OpenAI Responses API's tools parameter.
 */
export function agentToolsToSchemas(tools: AgentTool[]): unknown {
  return tools.map(t => t.schema)
}
