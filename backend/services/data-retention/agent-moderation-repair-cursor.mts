import type { QueryExecutor } from '@data-stores/psql'
import { repairAgentModerationRetentionPage } from './repair-agent-moderation-retention-page.mts'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

/** The daily data retention lane is the sole writer of this checkpoint. */
export async function repairPersistedAgentModerationPage(
  query: QueryExecutor,
  batchSize: number,
  lowerBoundId: string,
  requestedUpperId: string,
  postIds?: readonly string[],
) {
  const {
    rows: [cursor],
  } = await query<{
    cursor_record_id: string
    cursor_lower_bound_record_id: string
    sweep_upper_bound_record_id: string
  }>(
    `/* readAgentModerationRepairCursor */
     SELECT cursor_record_id, cursor_lower_bound_record_id, sweep_upper_bound_record_id
     FROM post_moderation_retention_cursors WHERE kind = 'agent_moderation_repair'`,
  )
  const upperId = cursor?.sweep_upper_bound_record_id ?? requestedUpperId
  // A running pass retains its original age bound. A clock change may temporarily
  // move the current safe deletion bound behind that pass.
  if (upperId > requestedUpperId) {
    return { scanned: 0, next: null }
  }
  const result = await repairAgentModerationRetentionPage(
    query,
    batchSize,
    {
      id: cursor?.cursor_record_id ?? ZERO_UUID,
      post_id: cursor?.cursor_lower_bound_record_id ?? ZERO_UUID,
    },
    lowerBoundId,
    upperId,
    postIds,
  )
  if (result.next) {
    await query(
      `/* checkpointAgentModerationRepairCursor */
       INSERT INTO post_moderation_retention_cursors
         (kind, cursor_record_id, cursor_lower_bound_record_id, sweep_upper_bound_record_id)
       VALUES ('agent_moderation_repair', $1::uuid, $2::uuid, $3::uuid)
       ON CONFLICT (kind) DO UPDATE
       SET cursor_record_id = EXCLUDED.cursor_record_id,
           cursor_lower_bound_record_id = EXCLUDED.cursor_lower_bound_record_id,
           sweep_upper_bound_record_id = EXCLUDED.sweep_upper_bound_record_id`,
      [result.next.id, result.next.post_id, upperId],
    )
  } else if (cursor) {
    await query(
      `/* resetAgentModerationRepairCursor */
       DELETE FROM post_moderation_retention_cursors WHERE kind = 'agent_moderation_repair'`,
    )
  }
  return result
}
