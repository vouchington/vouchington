-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Durable per-call audit records for MCP surfaces. One row per JSON-RPC call (plus a follow-up row
-- when an admitted tool call fails). Only the validated copyright decision rationale is retained,
-- encrypted; arbitrary arguments, results, tokens, and headers are never stored.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS mcp_call_audit_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  surface mcp_call_audit_event_surfaces NOT NULL CHECK (surface IN ('mcp', 'admin_mcp')),
  correlation_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  oauth_client_id UUID REFERENCES oauth_clients (id) ON DELETE RESTRICT,
  api_key_id UUID REFERENCES retained_api_key_identities (id) ON DELETE RESTRICT,
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  jsonrpc_method TEXT CHECK (jsonrpc_method ~ '^[A-Za-z][A-Za-z0-9_./-]{0,63}$'),
  tool_name TEXT CHECK (tool_name ~ '^[A-Za-z0-9_.-]{1,64}$'),
  outcome mcp_call_audit_event_outcomes NOT NULL CHECK (outcome IN (
    'accepted',
    'tool_error',
    'invalid_request',
    'invalid_arguments',
    'not_found',
    'role_denied',
    'plan_denied',
    'scopes_undeclared',
    'insufficient_scope',
    'rate_limited'
  )),
  copyright_rationale_ciphertext TEXT,
  occurred_at TIMESTAMPTZ GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (tool_name IS NULL OR jsonrpc_method = 'tools/call'),
  CHECK (copyright_rationale_ciphertext IS NULL OR (
    surface = 'admin_mcp' AND jsonrpc_method = 'tools/call' AND outcome = 'accepted'
    AND tool_name IS NOT NULL
  )),
  CHECK (num_nonnulls(oauth_client_id, api_key_id) = 1)
  -- no updated_at or deleted_at: append-only
) PARTITION BY RANGE (id);

CREATE INDEX IF NOT EXISTS idx_mcp_call_audit_events__actor_user
  ON mcp_call_audit_events (actor_user_id, id);

CREATE INDEX IF NOT EXISTS idx_mcp_call_audit_events__oauth_client
  ON mcp_call_audit_events (oauth_client_id, id)
  WHERE oauth_client_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_call_audit_events__api_key
  ON mcp_call_audit_events (api_key_id, id)
  WHERE api_key_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mcp_call_audit_events__correlation
  ON mcp_call_audit_events (correlation_id, id);

CREATE OR REPLACE TRIGGER trigger_mcp_call_audit_events_append_only
BEFORE UPDATE OR DELETE ON mcp_call_audit_events
FOR EACH ROW EXECUTE FUNCTION fn_reject_mutation();

COMMENT ON TABLE mcp_call_audit_events IS 'Append-only durable audit of MCP calls made with a verified OAuth access token or user API key; one row per JSON-RPC message, plus a tool_error follow-up row for an admitted tool call that failed. Only validated copyright decision rationales are encrypted; arbitrary arguments, results, tokens, keys, and headers are never stored.';
COMMENT ON COLUMN mcp_call_audit_events.surface IS 'MCP surface that received the call: mcp (user) or admin_mcp.';
COMMENT ON COLUMN mcp_call_audit_events.correlation_id IS 'Server-minted id shared by every row written for one HTTP request; returned to the caller in the X-Correlation-Id response header.';
COMMENT ON COLUMN mcp_call_audit_events.actor_user_id IS 'Owner of the verified access token or API key; references the retained user identity so hard deletion preserves the record.';
COMMENT ON COLUMN mcp_call_audit_events.oauth_client_id IS 'OAuth client the access token was issued to; NULL when the call used an API key, and exactly one of oauth_client_id and api_key_id is set.';
COMMENT ON COLUMN mcp_call_audit_events.api_key_id IS 'API key the call authenticated with, by the retained API key identity so the record survives key deletion; NULL when the call used an OAuth access token. The key secret is never stored.';
COMMENT ON COLUMN mcp_call_audit_events.resource IS 'Protected resource URL of the MCP surface that received the call.';
COMMENT ON COLUMN mcp_call_audit_events.jsonrpc_method IS 'JSON-RPC method from a fixed allowlist of MCP methods, or NULL when the request was rejected before its body was read or named no supported method.';
COMMENT ON COLUMN mcp_call_audit_events.tool_name IS 'Name of a registered tool on the surface for a tools/call; NULL for other calls and for a requested name that is not a registered tool, so caller-supplied text is never stored.';
COMMENT ON COLUMN mcp_call_audit_events.outcome IS 'Authorization and dispatch result of the call, or tool_error when an admitted tool call failed; never derived from result content.';
COMMENT ON COLUMN mcp_call_audit_events.copyright_rationale_ciphertext IS 'Encrypted validated rationale for an admitted administrator copyright decision call, bound to this audit row id. No general argument or result text is stored.';
COMMENT ON COLUMN mcp_call_audit_events.occurred_at IS 'Time the audit row was written, derived from the UUIDv7 id.';
