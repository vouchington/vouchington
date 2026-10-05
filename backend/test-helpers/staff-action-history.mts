import { randomBytes } from 'node:crypto'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readStaffActionHistory(actorId: string) {
  const { rows } = await write<{
    id: string
    post_id: string | null
    agent_moderation_id: string | null
    agent_moderation_post_id: string | null
    moderation_appeal_id: string | null
    review_dispute_id: string | null
    action_type: string
    metadata: Record<string, unknown>
    reason: string | null
    topic_claim_id: string | null
    report_id: string | null
    target_user_id: string | null
    oauth_client_id: string | null
    operation_request_action_id: string | null
  }>(
    sql`/* readStaffActionHistory */ SELECT * FROM moderator_actions WHERE actor_user_id = ${actorId} ORDER BY id`,
  )
  return rows
}

/** A unique actor predicate keeps the failure injection isolated from concurrent tests. */
export async function withRejectedStaffActionHistory<T>(
  actorId: string,
  execute: () => Promise<T>,
  phase?: 'finished',
): Promise<T> {
  const suffix = randomBytes(8).toString('hex')
  const name = `test_staff_history_${suffix}`
  await write(`/* withRejectedStaffActionHistory:createFunction */ CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $body$
    BEGIN
      IF NEW.actor_user_id = '${actorId.replaceAll("'", "''")}'::uuid ${phase ? "AND NEW.metadata->>'phase' = 'finished'" : ''} THEN
        RAISE EXCEPTION 'staff history rejected for test';
      END IF;
      RETURN NEW;
    END
    $body$`)
  try {
    await write(`/* withRejectedStaffActionHistory:createTrigger */ CREATE TRIGGER ${name} BEFORE INSERT ON moderator_actions
      FOR EACH ROW EXECUTE FUNCTION ${name}()`)
    try {
      return await execute()
    } finally {
      await write(
        `/* withRejectedStaffActionHistory:dropTrigger */ DROP TRIGGER ${name} ON moderator_actions`,
      )
    }
  } finally {
    await write(`/* withRejectedStaffActionHistory:dropFunction */ DROP FUNCTION ${name}()`)
  }
}

const HISTORY_TARGET_TABLES = {
  topic_claim: 'topic_claims',
  report: 'moderation_reports',
  report_claim: 'moderation_queue_claims',
  report_flag: 'report_integrity_flags',
  report_penalty: 'report_abuse_penalties',
  vote_flag: 'vote_integrity_flags',
  vote_penalty: 'vote_weight_penalties',
  note: 'user_moderator_notes',
  oauth_client: 'oauth_clients',
} as const

export async function readStaffActionTarget(kind: keyof typeof HISTORY_TARGET_TABLES, id: string) {
  const query = sql`/* readStaffActionTarget */ SELECT to_jsonb(target) AS state FROM `
  query.append(HISTORY_TARGET_TABLES[kind])
  query.append(sql` target WHERE id = ${id}`)
  const { rows } = await write<{ state: Record<string, unknown> }>(query)
  return rows[0]?.state ?? null
}

export async function readReportStaffClaims(reportId: string) {
  const { rows } = await write(sql`/* readReportStaffClaims */
    SELECT * FROM moderation_queue_claims WHERE report_id = ${reportId} ORDER BY id
  `)
  return rows
}
