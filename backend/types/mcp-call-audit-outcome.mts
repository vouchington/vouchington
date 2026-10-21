// The mcp_call_audit_events.outcome vocabulary. `accepted` passed authentication and
// authorization; `tool_error` is the final outcome when an admitted call then failed.
export type McpCallAuditOutcome =
  | 'accepted'
  | 'tool_error'
  | 'invalid_request'
  | 'invalid_arguments'
  | 'not_found'
  | 'role_denied'
  | 'plan_denied'
  | 'suspended'
  | 'scopes_undeclared'
  | 'insufficient_scope'
  | 'rate_limited'
