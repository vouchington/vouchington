import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationAppealChangeType } from './config.mts'

export interface AppealLifecycleSnapshot {
  metadata?: Record<string, unknown>
}

export async function appendAppealLifecycleChange(
  appealId: string,
  changeType: ModerationAppealChangeType,
  changedById: string | null,
  snapshot: AppealLifecycleSnapshot = {},
  options?: QueryOptions,
): Promise<string> {
  const { rows } = await write(
    sql`/* appendAppealLifecycleChange */
    INSERT INTO moderation_appeal_lifecycle_changes (
      moderation_appeal_id,
      change_type,
      changed_by_id,
      metadata
    )
    VALUES (
      ${appealId},
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
