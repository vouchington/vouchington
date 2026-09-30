import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ApiScope } from '@modules/scopes'
import type { McpCallAuditEvent } from './audit.mts'
import type { McpServerConfig } from './config.mts'
import { resolveMcpToolCall } from './resolve-tool-call.mts'
import { validateToolArguments } from './validate-tool-arguments.mts'

// Only these methods are ever written to the audit log. Anything else, including text an arbitrary
// caller chose, is recorded as an invalid request with no method.
const AUDITED_METHODS: ReadonlySet<string> = new Set([
  'initialize',
  'ping',
  'tools/list',
  'tools/call',
  'notifications/initialized',
  'notifications/cancelled',
])

// A larger JSON-RPC batch is refused on an audited surface instead of writing an unbounded number
// of audit rows for one request.
export const MAX_AUDITED_MCP_MESSAGES = 25

type UserForClassification = {
  id: string
  roles: readonly string[]
  membership_plan: 'plus' | 'pro' | null
}

const INVALID_REQUEST: McpCallAuditEvent = {
  jsonrpcMethod: null,
  toolName: null,
  outcome: 'invalid_request',
}

export function exceedsMcpAuditBatchLimit(parsedBody: unknown): boolean {
  return Array.isArray(parsedBody) && parsedBody.length > MAX_AUDITED_MCP_MESSAGES
}

// Predicts, without running anything, how each JSON-RPC message in a request will be authorized, so
// the outcome can be stored before any tool executes. It uses the same resolution as callMcpTool.
export function classifyMcpCalls(
  parsedBody: unknown,
  user: UserForClassification,
  grantedScopes: readonly ApiScope[],
  config: McpServerConfig,
): McpCallAuditEvent[] {
  const messages: unknown[] = Array.isArray(parsedBody) ? parsedBody : [parsedBody]
  if (messages.length === 0) return [INVALID_REQUEST]
  return messages.map(message => classifyMessage(message, user, grantedScopes, config))
}

function classifyMessage(
  message: unknown,
  user: UserForClassification,
  grantedScopes: readonly ApiScope[],
  config: McpServerConfig,
): McpCallAuditEvent {
  const method = readAuditedMethod(message)
  if (!method) return INVALID_REQUEST
  if (method === 'tools/list') {
    const valid = ListToolsRequestSchema.safeParse(message).success
    return {
      jsonrpcMethod: method,
      toolName: null,
      outcome: valid ? 'accepted' : 'invalid_request',
    }
  }
  if (method !== 'tools/call') return { jsonrpcMethod: method, toolName: null, outcome: 'accepted' }

  const request = CallToolRequestSchema.safeParse(message)
  if (!request.success) return { jsonrpcMethod: method, toolName: null, outcome: 'invalid_request' }
  const { name, arguments: args } = request.data.params
  const resolution = resolveMcpToolCall(name, user, grantedScopes, config)
  // An unregistered name is caller-supplied text, so it is never stored.
  if (resolution.status === 'not_found') {
    return { jsonrpcMethod: method, toolName: null, outcome: 'not_found' }
  }
  if (resolution.status !== 'allowed') {
    return { jsonrpcMethod: method, toolName: name, outcome: resolution.status }
  }
  const invalidArguments = validateToolArguments(resolution.tool.schema.parameters, args ?? {})
  return {
    jsonrpcMethod: method,
    toolName: name,
    outcome: invalidArguments ? 'invalid_arguments' : 'accepted',
  }
}

function readAuditedMethod(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null
  const { method } = message as { method?: unknown }
  return typeof method === 'string' && AUDITED_METHODS.has(method) ? method : null
}
