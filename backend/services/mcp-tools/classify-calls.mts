import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js'
import type { ApiScope } from '@modules/scopes'
import type { McpCallAuditEvent } from './audit.mts'
import type { McpServerConfig } from './config.mts'
import { resolveMcpToolCall } from './resolve-tool-call.mts'
import { toolRouteKeys } from './tool-route-keys.mts'
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

// A `tools/call` that will run and exercises REST routes. `eventIndex` is its row in the plan's
// events, and `requestId` is the JSON-RPC id the server answers it under.
export type McpToolCallCharge = {
  eventIndex: number
  requestId: string | number
  routeKeys: readonly string[]
}

export type McpCallPlan = {
  events: McpCallAuditEvent[]
  charges: McpToolCallCharge[]
}

type ClassifiedMessage = {
  event: McpCallAuditEvent
  charge: Pick<McpToolCallCharge, 'requestId' | 'routeKeys'> | null
}

export function exceedsMcpAuditBatchLimit(parsedBody: unknown): boolean {
  return Array.isArray(parsedBody) && parsedBody.length > MAX_AUDITED_MCP_MESSAGES
}

// Predicts, without running anything, how each JSON-RPC message in a request will be authorized, so
// the outcome can be stored before any tool executes. It uses the same resolution as callMcpTool.
// It also names the REST route buckets each call that will run exercises, so they can be charged
// first. A call that is refused before it runs, or a notification, exercises none.
export function planMcpCalls(
  parsedBody: unknown,
  user: UserForClassification,
  grantedScopes: readonly ApiScope[],
  config: McpServerConfig,
  copyrightDecisionToolsEnabled = false,
): McpCallPlan {
  const messages: unknown[] = Array.isArray(parsedBody) ? parsedBody : [parsedBody]
  if (messages.length === 0) return { events: [INVALID_REQUEST], charges: [] }
  const classified = messages.map(message =>
    classifyMessage(message, user, grantedScopes, config, copyrightDecisionToolsEnabled),
  )
  return {
    events: classified.map(({ event }) => event),
    charges: classified.flatMap(({ charge }, eventIndex) =>
      charge ? [{ eventIndex, ...charge }] : [],
    ),
  }
}

function classifyMessage(
  message: unknown,
  user: UserForClassification,
  grantedScopes: readonly ApiScope[],
  config: McpServerConfig,
  copyrightDecisionToolsEnabled: boolean,
): ClassifiedMessage {
  const method = readAuditedMethod(message)
  if (!method) return uncharged(INVALID_REQUEST)
  if (method === 'tools/list') {
    const valid = ListToolsRequestSchema.safeParse(message).success
    return uncharged({
      jsonrpcMethod: method,
      toolName: null,
      outcome: valid ? 'accepted' : 'invalid_request',
    })
  }
  if (method !== 'tools/call') {
    return uncharged({ jsonrpcMethod: method, toolName: null, outcome: 'accepted' })
  }

  const request = CallToolRequestSchema.safeParse(message)
  if (!request.success) {
    return uncharged({ jsonrpcMethod: method, toolName: null, outcome: 'invalid_request' })
  }
  const { name, arguments: args } = request.data.params
  const resolution = resolveMcpToolCall(
    name,
    user,
    grantedScopes,
    config,
    copyrightDecisionToolsEnabled,
  )
  // An unregistered name is caller-supplied text, so it is never stored.
  if (resolution.status === 'not_found') {
    return uncharged({ jsonrpcMethod: method, toolName: null, outcome: 'not_found' })
  }
  if (resolution.status !== 'allowed') {
    return uncharged({ jsonrpcMethod: method, toolName: name, outcome: resolution.status })
  }
  const callArguments = args ?? {}
  const invalidArguments = validateToolArguments(resolution.tool.schema.parameters, callArguments)
  const copyrightRationale =
    !invalidArguments &&
    resolution.tool.meta?.switch === 'copyright.mcpDecisionTools' &&
    resolution.tool.meta.auditRationale === true &&
    typeof callArguments.rationale === 'string'
      ? callArguments.rationale
      : undefined
  // Without an id the request is a notification, which the server never answers or runs.
  const requestId = invalidArguments ? null : readRequestId(message)
  const routeKeys = requestId === null ? [] : toolRouteKeys(resolution.tool.meta, callArguments)
  return {
    event: {
      jsonrpcMethod: method,
      toolName: name,
      outcome: invalidArguments ? 'invalid_arguments' : 'accepted',
      ...(copyrightRationale === undefined ? {} : { copyrightRationale }),
    },
    charge: requestId !== null && routeKeys.length > 0 ? { requestId, routeKeys } : null,
  }
}

function uncharged(event: McpCallAuditEvent): ClassifiedMessage {
  return { event, charge: null }
}

// The id the SDK answers a request under: a string or an integer.
function readRequestId(message: unknown): string | number | null {
  const { id } = message as { id?: unknown }
  return typeof id === 'string' || (typeof id === 'number' && Number.isInteger(id)) ? id : null
}

function readAuditedMethod(message: unknown): string | null {
  if (typeof message !== 'object' || message === null) return null
  const { method } = message as { method?: unknown }
  return typeof method === 'string' && AUDITED_METHODS.has(method) ? method : null
}
