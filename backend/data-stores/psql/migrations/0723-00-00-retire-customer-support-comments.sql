-- Remove retired customer-support references from durable schema comments.

COMMENT ON COLUMN ai_usage_records.community_id IS
  'The community the call is scoped to, if any; NULL for agents that run outside a community.';

COMMENT ON COLUMN users.is_system IS
  'Marks a row as a system-owned account (for example, jong admin or autotagger). Reserved-username seed generators reclaim the username from any non-system holder before upserting here, and role or lookup gates require is_system = TRUE so a squatter can never inherit a system identity.';
