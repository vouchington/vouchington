import type { McpCallAuditOutcome } from '@voucha/types/mcp-call-audit-outcome'
import type { AnalyticsBaseRecord, ApiUsageRecord } from './table-records.mts'

/**
 * One settled MCP JSON-RPC message. Columns are identity ids or closed vocabularies.
 * Tool arguments, results, tokens, headers, and free text are not stored.
 */
export interface McpToolCallRecord extends AnalyticsBaseRecord {
  audience: 'admin' | 'brand' | 'community_moderation' | 'legal' | 'user'
  credential: 'api_key' | 'oauth'
  user_id: string
  api_key_id: string | null
  oauth_client_id: string | null
  oauth_grant_id: string | null
  plan: ApiUsageRecord['plan']
  /** `api_usage.event_id` for the HTTP request that carried this message. */
  request_event_id: string
  batch_size: number
  batch_index: number
  /** Registered tool name; null for a non-tool JSON-RPC method. */
  tool: string | null
  /** Merged-tool option from `meta.auditOption`; null for a flat tool. */
  option: string | null
  jsonrpc_method: string | null
  outcome: McpCallAuditOutcome
  /** Milliseconds around the tool function; null when that function never ran. */
  duration_ms: number | null
}
