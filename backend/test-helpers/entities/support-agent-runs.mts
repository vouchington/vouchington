import { setTimeout as delay } from 'node:timers/promises'
import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function expireTestSupportAgentRunLease(agentRunId: string): Promise<void> {
  await write(sql`/* expireTestSupportAgentRunLease */
    UPDATE support_agent_runs
    SET started_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    WHERE id = ${agentRunId}
  `)
}

export async function expireTestSupportDraftGenerationReservation(
  agentRunId: string,
): Promise<void> {
  await write(sql`/* expireTestSupportDraftGenerationReservation */
    UPDATE support_agent_runs
    SET staff_draft_requested_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes',
        started_at = CURRENT_TIMESTAMP - INTERVAL '5 minutes'
    WHERE id = ${agentRunId}
  `)
}

export async function markTestSupportAgentRunStaffRequested(agentRunId: string): Promise<void> {
  await write(sql`/* markTestSupportAgentRunStaffRequested */
    UPDATE support_agent_runs
    SET staff_draft_requested_at = CURRENT_TIMESTAMP
    WHERE id = ${agentRunId}
  `)
}

export async function waitForBlockedSupportThreadLock(
  queryMarker = '/* lockSupportThread */',
): Promise<void> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    const { rows } = await write<{ blocked: boolean }>(sql`
      /* waitForBlockedSupportThreadLock */
      SELECT EXISTS (
        SELECT 1
        FROM pg_stat_activity
        WHERE pid <> pg_backend_pid()
          AND state = 'active'
          AND wait_event_type = 'Lock'
          AND query LIKE ${`%${queryMarker}%`}
      ) AS blocked
    `)
    if (rows[0]?.blocked) return
    await delay(10)
  }
  throw new Error(`Support thread operation did not wait for the fixture row lock: ${queryMarker}`)
}
