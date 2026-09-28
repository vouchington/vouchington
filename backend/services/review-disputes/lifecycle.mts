import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ReviewDisputeChangeType, ReviewDisputeAction } from './config.mts'

export interface LifecycleSnapshot {
  drafted_at?: Date | null
  edited_at?: Date | null
  approved_at?: Date | null
  sent_at?: Date | null
  resolved_at?: Date | null
  resolution_action?: ReviewDisputeAction | null
}

export async function appendLifecycleChange(
  disputeId: string,
  changeType: ReviewDisputeChangeType,
  changedById: string | null,
  snapshot: LifecycleSnapshot = {},
  options?: QueryOptions,
): Promise<string> {
  const { rows } = await write(
    sql`/* appendLifecycleChange */
    INSERT INTO review_dispute_lifecycle_changes (
      review_dispute_id,
      change_type,
      changed_by_id,
      drafted_at,
      edited_at,
      approved_at,
      sent_at,
      resolved_at,
      resolution_action
    )
    VALUES (
      ${disputeId},
      ${changeType},
      ${changedById},
      ${snapshot.drafted_at ?? null},
      ${snapshot.edited_at ?? null},
      ${snapshot.approved_at ?? null},
      ${snapshot.sent_at ?? null},
      ${snapshot.resolved_at ?? null},
      ${snapshot.resolution_action ?? null}
    )
    RETURNING id
  `,
    options,
  )
  return (rows[0] as { id: string }).id
}
