import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// Leaves failed_at NULL so reserveSupportDraftGeneration's active_automatic_inbound_run predicate
// (draft-generation-reservation.mts) keeps treating this run as active until the redelivered job
// finishes. This table's started_at is NOT NULL DEFAULT CURRENT_TIMESTAMP and stays untouched --
// claimKeyedSupportAgentRun's reclaim
// predicate already treats claim_token IS NULL as immediately reclaimable.
export async function releaseClaimedSupportAgentRun(
  id: string,
  claimToken: string,
): Promise<boolean> {
  const result = await write(sql`/* releaseClaimedSupportAgentRun */
    UPDATE support_agent_runs
    SET claim_token = NULL
    WHERE id = ${id}
      AND claim_token = ${claimToken}
      AND idempotency_key IS NOT NULL
      AND completed_at IS NULL
      AND failed_at IS NULL
  `)
  return result.rowCount === 1
}
