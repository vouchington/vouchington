import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function supersedeActiveStaffDraftGeneration(
  threadId: string,
  options: QueryOptions,
): Promise<void> {
  await write(
    sql`/* supersedeActiveStaffDraftGeneration */
      WITH active_staff_runs AS (
        SELECT id
        FROM support_agent_runs
        WHERE support_thread_id = ${threadId}
          AND staff_draft_requested_at IS NOT NULL
          AND completed_at IS NULL
          AND failed_at IS NULL
        ORDER BY id
        FOR UPDATE
      )
      UPDATE support_agent_runs run
      SET error = ${JSON.stringify({ error: 'Superseded by a newer inbound support message' })},
          termination_reason = 'superseded',
          claim_token = NULL,
          completed_at = CURRENT_TIMESTAMP,
          failed_at = NULL
      FROM active_staff_runs
      WHERE run.id = active_staff_runs.id
    `,
    options,
  )
}

export async function hasUnsentSupportDraft(
  threadId: string,
  options: QueryOptions,
): Promise<boolean> {
  const { rows } = await write(
    sql`/* hasUnsentSupportDraft */
      SELECT EXISTS (
        SELECT 1
        FROM support_messages
        WHERE support_thread_id = ${threadId}
          AND direction = 'outbound'
          AND drafted_at IS NOT NULL
          AND sent_at IS NULL
      ) AS exists
    `,
    options,
  )
  return (rows[0] as { exists: boolean } | undefined)?.exists ?? false
}

export async function coordinateLockedInboundSupportThread(
  threadId: string,
  options: QueryOptions,
): Promise<boolean> {
  await supersedeActiveStaffDraftGeneration(threadId, options)
  return await hasUnsentSupportDraft(threadId, options)
}
