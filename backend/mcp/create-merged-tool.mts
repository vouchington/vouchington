import type { BasicUser } from '@services/users/types'
import type { Tool, ToolInvocationContext, ToolMeta } from '@services/openai-agents/tool-types'
import {
  createMergedTool as createPackageMergedTool,
  type MergedToolSource as PackageMergedToolSource,
} from '@vouchington/mcp-server/tools'

export type MergedToolSource<TArgs = never, TResult = unknown> = PackageMergedToolSource<
  BasicUser,
  ToolInvocationContext,
  TArgs,
  TResult,
  ToolMeta
>
export type MergedToolOption<TArgs = never, TResult = unknown> = {
  option: string
  source: MergedToolSource<TArgs, TResult>
}

// Sources merge only when every gate Voucha authorizes on is equal; otherwise an option would
// inherit another option's scopes, audience, plan, roles, or annotations.
const compatibilityKey = (
  source: PackageMergedToolSource<BasicUser, ToolInvocationContext, never, unknown, ToolMeta>,
) => {
  const meta = source.meta
  return JSON.stringify({
    scopes: meta?.requiredScopes ?? null,
    audience: meta?.audience ?? null,
    plan: meta?.plan ?? 'free',
    suspendedAccess: meta?.suspendedAccess ?? false,
    // ast-grep-ignore: no-roles-outside-services -- Declared tool gates, not user roles; authorization stays in mcp-tools services.
    roles: source.roles ?? null,
    annotations: meta?.annotations ?? null,
    switch: meta?.switch ?? null,
    auditRationale: meta?.auditRationale === true,
  })
}

/** One MCP name, with each source tool's validator, handler and REST route selection retained. */
export function createMergedTool(
  name: string,
  title: string,
  options: readonly MergedToolOption[],
): Tool {
  return createPackageMergedTool<BasicUser, ToolInvocationContext, ToolMeta>(name, title, options, {
    compatibilityKey,
  })
}
