import { write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import type { ModerationAppealChangeType, ModerationAppealAction } from './config.mts'

export interface AppealLifecycleSnapshot {
  drafted_at?: Date | null
  edited_at?: Date | null
  approved_at?: Date | null
  sent_at?: Date | null
  resolved_at?: Date | null
  resolution_action?: ModerationAppealAction | null
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
      drafted_at,
      edited_at,
      approved_at,
      sent_at,
      resolved_at,
      resolution_action,
      metadata
    )
    VALUES (
      ${appealId},
      ${changeType},
      ${changedById},
      ${snapshot.drafted_at ?? null},
      ${snapshot.edited_at ?? null},
      ${snapshot.approved_at ?? null},
      ${snapshot.sent_at ?? null},
      ${snapshot.resolved_at ?? null},
      ${snapshot.resolution_action ?? null},
      ${JSON.stringify(snapshot.metadata ?? {})}
    )
    RETURNING id
  `,
    options,
  )
  return (rows[0] as { id: string }).id
}
