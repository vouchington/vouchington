-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
-- Durable per-call audit records for MCP surfaces. One row per JSON-RPC call (plus a follow-up row
-- when an admitted tool call fails). Validated copyright rationale is encrypted in a separate
-- legal record; arbitrary arguments, results, tokens, and headers are never stored.

-- edited-in-place: pre-launch, not yet deployed anywhere (including staging)
CREATE TABLE IF NOT EXISTS mcp_call_audit_events (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  audience mcp_call_audit_event_audiences NOT NULL CHECK (audience IN ('user', 'community_moderation', 'brand', 'admin', 'legal')),
  correlation_id UUID NOT NULL,
  actor_user_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  oauth_client_id UUID REFERENCES oauth_clients (id) ON DELETE RESTRICT,
  api_key_id UUID REFERENCES retained_api_key_identities (id) ON DELETE RESTRICT,
  resource TEXT NOT NULL CHECK (char_length(resource) BETWEEN 1 AND 2048),
  jsonrpc_method TEXT CHECK (jsonrpc_method ~ '^[A-Za-z][A-Za-z0-9_./-]{0,63}$'),
  tool_name TEXT CHECK (tool_name ~ '^[A-Za-z0-9_.-]{1,64}$'),
  tool_option TEXT CHECK (tool_option ~ '^[A-Za-z0-9_.-]{1,64}$'),
  outcome mcp_call_audit_event_outcomes NOT NULL CHECK (outcome IN (
    'accepted',
    'tool_error',
    'invalid_request',
    'invalid_arguments',
    'not_found',
    'role_denied',
    'plan_denied',
    'suspended',
    'scopes_undeclared',
    'insufficient_scope',
    'rate_limited'
  )),
  occurred_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (tool_option IS NULL OR tool_name IS NOT NULL),
  CHECK (tool_name IS NULL OR jsonrpc_method = 'tools/call'),
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

COMMENT ON TABLE mcp_call_audit_events IS 'Append-only 12-month security audit of MCP calls made with a verified OAuth access token or user API key; one row per JSON-RPC message, plus a tool_error follow-up row for an admitted tool call that failed. Arguments, results, tokens, keys, headers, and legal rationale are never stored here.';
COMMENT ON COLUMN mcp_call_audit_events.audience IS 'MCP server audience that received the call.';
COMMENT ON COLUMN mcp_call_audit_events.correlation_id IS 'Server-minted id shared by every row written for one HTTP request; returned to the caller in the X-Correlation-Id response header.';
COMMENT ON COLUMN mcp_call_audit_events.actor_user_id IS 'Owner of the verified access token or API key; references the retained user identity so hard deletion preserves the record.';
COMMENT ON COLUMN mcp_call_audit_events.oauth_client_id IS 'OAuth client the access token was issued to; NULL when the call used an API key, and exactly one of oauth_client_id and api_key_id is set.';
COMMENT ON COLUMN mcp_call_audit_events.api_key_id IS 'API key the call authenticated with, by the retained API key identity so the record survives key deletion; NULL when the call used an OAuth access token. The key secret is never stored.';
COMMENT ON COLUMN mcp_call_audit_events.resource IS 'Protected resource URL of the MCP audience that received the call.';
COMMENT ON COLUMN mcp_call_audit_events.jsonrpc_method IS 'JSON-RPC method from a fixed allowlist of MCP methods, or NULL when the request was rejected before its body was read or named no supported method.';
COMMENT ON COLUMN mcp_call_audit_events.tool_name IS 'Name of a registered tool on the audience for a tools/call; NULL for other calls and for a requested name that is not a registered tool, so caller-supplied text is never stored.';
COMMENT ON COLUMN mcp_call_audit_events.outcome IS 'Authorization and dispatch result of the call, or tool_error when an admitted tool call failed; never derived from result content.';
COMMENT ON COLUMN mcp_call_audit_events.occurred_at IS 'Time the audit row was written, derived from the UUIDv7 id.';

COMMENT ON COLUMN mcp_call_audit_events.tool_option IS 'Declared literal option of a registered merged tool, or NULL for flat tools and unknown selectors; arbitrary caller text is never stored.';

-- Legal rationale is encrypted against this row's own id when the audit row is written. The
-- exclusive arc binds it to a real case, intake or retained account and has no audit FK; the
-- short security partition can therefore retire independently of copyright evidence.
CREATE TABLE IF NOT EXISTS copyright_decision_rationales (
  id UUID PRIMARY KEY DEFAULT uuidv7(),
  copyright_notice_id UUID REFERENCES copyright_notices (id) ON DELETE CASCADE,
  copyright_notice_email_intake_id UUID REFERENCES copyright_notice_email_intakes (id) ON DELETE RESTRICT,
  copyright_repeat_infringer_review_id UUID REFERENCES copyright_repeat_infringer_reviews (id) ON DELETE RESTRICT,
  account_user_id UUID REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  recorded_by_id UUID NOT NULL REFERENCES retained_user_identities (id) ON DELETE RESTRICT,
  tool_name TEXT NOT NULL CHECK (tool_name ~ '^[a-z_]{1,64}$'),
  rationale_ciphertext TEXT NOT NULL CHECK (char_length(rationale_ciphertext) BETWEEN 1 AND 65536),
  created_at TIMESTAMPTZ NOT NULL GENERATED ALWAYS AS (uuid_extract_timestamp(id)) VIRTUAL,
  CHECK (num_nonnulls(copyright_notice_id, copyright_notice_email_intake_id,
    copyright_repeat_infringer_review_id, account_user_id) = 1)
);

CREATE INDEX IF NOT EXISTS idx_copyright_decision_rationales__notice
ON copyright_decision_rationales (copyright_notice_id, id)
WHERE copyright_notice_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_decision_rationales__email_intake
ON copyright_decision_rationales (copyright_notice_email_intake_id, id)
WHERE copyright_notice_email_intake_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_decision_rationales__repeat_review
ON copyright_decision_rationales (copyright_repeat_infringer_review_id, id)
WHERE copyright_repeat_infringer_review_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_decision_rationales__account_user
ON copyright_decision_rationales (account_user_id, id)
WHERE account_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_copyright_decision_rationales__recorded_by
ON copyright_decision_rationales (recorded_by_id);
CREATE INDEX IF NOT EXISTS idx_copyright_decision_rationales__erased_retention
ON copyright_decision_rationales (id) WHERE rationale_ciphertext = 'erased';
CREATE INDEX IF NOT EXISTS idx_copyright_decision_rationales__noncase_retention
ON copyright_decision_rationales (id)
WHERE copyright_notice_id IS NULL AND rationale_ciphertext <> 'erased';

CREATE OR REPLACE TRIGGER trigger_copyright_decision_rationales_immutable
BEFORE UPDATE OR DELETE ON copyright_decision_rationales
FOR EACH ROW EXECUTE FUNCTION fn_reject_copyright_notice_immutable_evidence();

COMMENT ON TABLE copyright_decision_rationales IS 'Encrypted rationale for an admitted legal MCP decision attempt, retained with a concrete legal case, intake, review or account independently of the short security audit. A later tool failure does not turn this attempted decision into a completed one.';
COMMENT ON COLUMN copyright_decision_rationales.copyright_notice_id IS 'Copyright case whose decision this rationale accompanies.';
COMMENT ON COLUMN copyright_decision_rationales.copyright_notice_email_intake_id IS 'Email intake that had not yet been admitted to a copyright case.';
COMMENT ON COLUMN copyright_decision_rationales.copyright_repeat_infringer_review_id IS 'Account-level repeat-infringer review when no single copyright case owns the decision.';
COMMENT ON COLUMN copyright_decision_rationales.account_user_id IS 'Retained account identity for a reinstatement decision when no single case owns it; this identity does not authorize the account.';
COMMENT ON COLUMN copyright_decision_rationales.recorded_by_id IS 'Retained staff identity that supplied the validated legal rationale.';
COMMENT ON COLUMN copyright_decision_rationales.tool_name IS 'Registered legal decision tool name, never arbitrary caller text.';
COMMENT ON COLUMN copyright_decision_rationales.rationale_ciphertext IS 'Validated rationale encrypted with AAD bound to this row id; erased under copyright retention.';

-- Each security-retention family has its own durable keyset position. A completed pass resets
-- the position so rows that became eligible after an earlier scan are reconsidered.
CREATE TYPE security_retention_sources AS ENUM (
  'oauth_events', 'oauth_grants', 'oauth_grant_anchors', 'oauth_clients', 'api_keys_revoked',
  'api_keys_expired', 'facebook_friends', 'github_friends', 'x_friends',
  'copyright_rationales_erased', 'copyright_rationales_noncase'
);

CREATE TABLE IF NOT EXISTS security_retention_cleanup_cursors (
  source security_retention_sources PRIMARY KEY,
  cursor_at TIMESTAMPTZ,
  cursor_id UUID,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK ((cursor_at IS NULL) = (cursor_id IS NULL))
);

CREATE OR REPLACE TRIGGER trigger_security_retention_cleanup_cursors_updated_at
BEFORE UPDATE ON security_retention_cleanup_cursors
FOR EACH ROW EXECUTE FUNCTION fn_update_updated_at();

COMMENT ON TABLE security_retention_cleanup_cursors IS 'One durable keyset position per bounded security-record cleanup source.';
COMMENT ON COLUMN security_retention_cleanup_cursors.source IS 'Security-record family whose cleanup scan owns this position.';
COMMENT ON COLUMN security_retention_cleanup_cursors.cursor_at IS 'Last scanned eligibility timestamp; NULL starts a new complete pass.';
COMMENT ON COLUMN security_retention_cleanup_cursors.cursor_id IS 'UUIDv7 tie-breaker of the last scanned record; NULL starts a new complete pass.';
COMMENT ON COLUMN security_retention_cleanup_cursors.updated_at IS 'Last committed bounded security retention sweep for this source.';
