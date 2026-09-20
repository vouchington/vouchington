import type { BasicUser } from '@services/users/types'
import type { ApiScope } from '@modules/scopes'

type ToolSchema = {
  name: string
  type: 'function'
  description?: string | null
  parameters: {
    [key: string]: unknown
  } | null
  // Set to `true` to enable OpenAI structured outputs / strict JSON schema validation.
  // Set to `null` to leave provider strict-mode unset. `false` is not a supported value.
  strict: true | null
}

type ToolFunction<
  TArgs = unknown,
  TResult = unknown,
  TCurry extends readonly unknown[] = readonly [],
> = (currentUser: BasicUser, ...curry: TCurry) => (args: TArgs) => Promise<TResult> | TResult

// Structural twin of OpenAIFunctionCallOutput — decouples the Tool contract from @services/openai-agents
export type ToolCallOutput = { type: 'function_call_output'; call_id: string; output: string }

export type ToolSurface = 'internal' | 'mcp' | 'admin_mcp' | 'client'

export type ToolAnnotations = {
  readOnlyHint?: boolean
  destructiveHint?: boolean
  idempotentHint?: boolean
  openWorldHint?: boolean
}

export type ToolApiEndpoint = {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'
  path: string
}

export type ToolMeta = {
  // Which surfaces this tool is exposed on. Defaults to ['internal'] when absent.
  surfaces: readonly ToolSurface[]
  // Minimum membership plan required. Default 'free'. No tools plan-gated initially (mechanism only).
  plan?: 'free' | 'plus' | 'pro'
  annotations?: ToolAnnotations
  // Canonical scopes required for an externally callable surface. Internal and client-only tools need none.
  requiredScopes?: Partial<Record<'mcp' | 'admin_mcp', readonly ApiScope[]>>
  // Equivalent existing REST endpoint(s), or null if none exist.
  api: readonly ToolApiEndpoint[] | null
}

export type Tool<
  TArgs = unknown,
  TResult = unknown,
  TCurry extends readonly unknown[] = readonly [],
> = {
  schema: ToolSchema
  function: ToolFunction<TArgs, TResult, TCurry>
  formatResult?: (callId: string, result: TResult) => ToolCallOutput
  roles?: Partial<Record<string, boolean>>
  meta?: ToolMeta
}
