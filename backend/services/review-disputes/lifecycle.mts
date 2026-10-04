import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ReviewDisputeChangeType } from './config.mts'

export interface LifecycleSnapshot {
  metadata?: Record<string, unknown>
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
      metadata
    )
    VALUES (
      ${disputeId},
      ${changeType},
      ${changedById},
      ${JSON.stringify(snapshot.metadata ?? {})}
    )
    RETURNING id
  `,
    options,
  )
  return (rows[0] as { id: string }).id
}
