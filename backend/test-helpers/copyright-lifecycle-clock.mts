import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

/** Owner-row clock read independent of finite lifecycle audit history. */
export async function readCopyrightCaseLifecycleClock(noticeId: string): Promise<Date | null> {
  const { rows } = await read<{ last_lifecycle_activity_at: Date | null }>(sql`
    /* readCopyrightCaseLifecycleClock */
    SELECT last_lifecycle_activity_at FROM copyright_notices WHERE id = ${noticeId}
  `)
  if (!rows[0]) throw new Error('Copyright notice missing for lifecycle clock assertion')
  return rows[0].last_lifecycle_activity_at
}

/** Confirms the exact replay audit remains, independently of the case owner clock. */
export async function hasCopyrightRegistryReplayAudit(
  noticeId: string,
  recordId: string,
  actorId: string,
): Promise<boolean> {
  const { rows } = await read<{ id: string }>(sql`
    /* hasCopyrightRegistryReplayAudit */
    SELECT id FROM copyright_notice_lifecycle_changes
    WHERE copyright_notice_id = ${noticeId}
      AND media_delivery_registry_record_id = ${recordId}
      AND changed_by_id = ${actorId}
      AND change_type = 'media_delivery_registry_replayed'
    LIMIT 1
  `)
  return rows.length === 1
}
