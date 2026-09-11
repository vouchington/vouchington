import { read, type QueryExecutor } from '@data-stores/psql'
import sql from 'sql-template-strings'

export const FOLLOWER_INBOX_BATCH_SIZE = 500

export type RemoteFollowerInboxRow = {
  remoteActorId: string
  inboxUrl: string | null
}

// Returns one strict keyset page of follower candidates. Eligibility is deliberately resolved only
// after the bounded candidate list: deleted and blocked candidates have a null inbox but remain in
// the page so callers can commit their cursor and cannot stall behind an ineligible follower.
export async function listRemoteFollowerInboxPage(
  userId: string,
  afterRemoteActorId: string | null,
  limit: number,
  options: { query?: QueryExecutor } = {},
): Promise<RemoteFollowerInboxRow[]> {
  const query = options.query ?? read
  const statement = sql`/* listRemoteFollowerInboxPage */
    WITH candidate_followers AS MATERIALIZED (
      SELECT rel.subject_id
      FROM relation__remote_actor__follow__user rel
      WHERE rel.object_id = ${userId}
        AND rel.deleted_at IS NULL`
  if (afterRemoteActorId) statement.append(sql` AND rel.subject_id > ${afterRemoteActorId}`)
  statement.append(sql`
      ORDER BY rel.object_id, rel.subject_id
      LIMIT ${limit}
    )
    SELECT candidate.subject_id AS remote_actor_id,
      CASE WHEN ra.id IS NULL OR blocked_instance.topic_id IS NOT NULL THEN NULL
        ELSE COALESCE(ra.shared_inbox_url, ra.inbox_url)
      END AS inbox_url
    FROM candidate_followers candidate
    LEFT JOIN LATERAL (
      SELECT ra.id, ra.hostname_id, ra.inbox_url, ra.shared_inbox_url
      FROM remote_actors ra
      WHERE ra.id = candidate.subject_id AND ra.deleted_at IS NULL
      LIMIT 1
    ) ra ON true
    LEFT JOIN LATERAL (
      SELECT instance_topic.id AS topic_id
      FROM topics instance_topic
      JOIN topics__fediverse_instances tfi ON tfi.topic_id = instance_topic.id
      WHERE instance_topic.hostname_id = ra.hostname_id
        AND instance_topic.topic_type = 'fediverse_instance'
        AND instance_topic.deleted_at IS NULL
        AND instance_topic.merged_into_topic_id IS NULL
        AND tfi.integration_status = 'blocked'
      LIMIT 1
    ) blocked_instance ON true
    ORDER BY candidate.subject_id
  `)
  const { rows } = await query<{
    remote_actor_id: string
    inbox_url: string | null
  }>(statement)
  return rows.map(row => ({ remoteActorId: row.remote_actor_id, inboxUrl: row.inbox_url }))
}
