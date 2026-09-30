import { randomBytes, randomUUID } from 'node:crypto'
import type { QueryExecutor } from '@data-stores/psql'
import { registerOAuthClient } from '../../services/oauth-authorization-server/clients.mts'

/** Append-only audit rows that name a user only through the retained identity root. */
export const retainedUserAuditReferences = [
  {
    table: 'post_clearance_changes',
    column: 'changed_by_id',
    constraint: 'post_clearance_changes_changed_by_id_fkey',
  },
  {
    table: 'post_moderation_dispositions',
    column: 'actor_user_id',
    constraint: 'post_moderation_dispositions_actor_user_id_fkey',
  },
  {
    table: 'oauth_authorization_server_events',
    column: 'user_id',
    constraint: 'oauth_authorization_server_events_user_id_fkey',
  },
  {
    table: 'mcp_call_audit_events',
    column: 'actor_user_id',
    constraint: 'mcp_call_audit_events_actor_user_id_fkey',
  },
] as const

/** Audit logs that reject deletes, so their rows cannot be removed to release a retained root. */
export const appendOnlyRetainedUserAuditTables: readonly RetainedUserAuditTable[] = [
  'oauth_authorization_server_events',
  'mcp_call_audit_events',
]

export type RetainedUserAuditTable = (typeof retainedUserAuditReferences)[number]['table']

/** `postId` scopes the post-owned audit rows; the OAuth and MCP audit rows carry no post. */
export async function insertTestRetainedUserAuditRow(
  query: QueryExecutor,
  table: RetainedUserAuditTable,
  actorId: string,
  postId: string,
): Promise<void> {
  if (table === 'post_clearance_changes') {
    await query(
      `/* insertTestRetainedUserAuditClearanceChange */
      INSERT INTO post_clearance_changes (post_id, change_type, changed_by_id)
      VALUES ($1, 'approve', $2)`,
      [postId, actorId],
    )
  } else if (table === 'post_moderation_dispositions') {
    await query(
      `/* insertTestRetainedUserAuditModerationDisposition */
      WITH version AS (
        INSERT INTO post_moderation_versions (post_id, content_sha256, policy_revision)
        VALUES ($1, $3, 'retained-user-audit-test') RETURNING id
      )
      INSERT INTO post_moderation_dispositions
        (version_id, source, disposition, reason_code, actor_user_id)
      SELECT id, 'staff', 'pass', 'staff_pass', $2 FROM version`,
      [postId, actorId, randomBytes(32)],
    )
  } else if (table === 'mcp_call_audit_events') {
    const client = await registerOAuthClient(
      {
        client_name: 'Retained user audit test',
        redirect_uris: ['http://127.0.0.1:31337/callback/retained-user-audit'],
        scope: 'mcp.user:read',
        token_endpoint_auth_method: 'none',
      },
      null,
      query,
    )
    await query(
      `/* insertTestRetainedUserAuditMcpCall */
      INSERT INTO mcp_call_audit_events
        (surface, correlation_id, actor_user_id, oauth_client_id, resource, jsonrpc_method, outcome)
      SELECT 'mcp', $1::uuid, $2::uuid, id, 'https://example.test/mcp', 'tools/list', 'accepted'
      FROM oauth_clients WHERE client_id = $3`,
      [randomUUID(), actorId, client.client_id],
    )
  } else {
    await query(
      `/* insertTestRetainedUserAuditOAuthServerEvent */
      INSERT INTO oauth_authorization_server_events
        (event_type, access_token_id, user_id, client_id, grant_id, resource, scopes)
      VALUES ('access_token_revoked', $1, $2, $3, $4, 'https://example.test/mcp', ARRAY['read'])`,
      [randomUUID(), actorId, randomUUID(), randomUUID()],
    )
  }
}

export async function countTestRetainedUserAuditRows(
  query: QueryExecutor,
  table: RetainedUserAuditTable,
  actorId: string,
): Promise<number> {
  const reference = retainedUserAuditReferences.find(entry => entry.table === table)!
  const { rows } = await query<{ count: string }>(
    `/* countTestRetainedUserAuditRows */
    SELECT COUNT(*)::text AS count FROM ${table} WHERE ${reference.column} = $1`,
    [actorId],
  )
  return Number(rows[0]!.count)
}
