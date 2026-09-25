import { read, write } from '@data-stores/psql'
import { encodeScopedPreciseTimestampCursor } from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../../../services/copyright-notices/read-models-staff.mts'
import sql from 'sql-template-strings'

export async function readCopyrightNoticeTargetId(noticeId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightNoticeTargetId */
    SELECT id FROM copyright_notice_targets WHERE copyright_notice_id = ${noticeId}
    ORDER BY id LIMIT 1`)
  if (!rows[0]) throw new Error(`Copyright notice has no target: ${noticeId}`)
  return rows[0].id
}

/**
 * Staff-queue `after` cursor whose first page starts at the oldest of `noticeIds`. The queue is
 * global and the test database is shared and never cleaned, so a test that reads from the queue
 * head sees other tests' cases; seeking one microsecond before its own oldest case keeps every
 * page on rows at or after the ones it created.
 */
export async function readCopyrightStaffQueueCursorBefore(noticeIds: string[]): Promise<string> {
  const { rows } = await read<{ id: string; cursor_received_at: string }>(
    sql`/* readCopyrightStaffQueueCursorBefore */
      SELECT notice.id, to_char(
        (notice.received_at - interval '1 microsecond') AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_received_at
      FROM copyright_notices notice
      WHERE notice.id = ANY(${noticeIds}::uuid[])
      ORDER BY notice.received_at, notice.id
      LIMIT 1`,
  )
  if (!rows[0]) throw new Error('Copyright staff queue fixture has no notices')
  return encodeScopedPreciseTimestampCursor(
    rows[0].cursor_received_at,
    rows[0].id,
    copyrightStaffQueueCursorScope,
  )
}

export async function readCopyrightStaffQueueCursorRows(
  noticeIds: string[],
): Promise<Array<{ id: string; received_at: string }>> {
  const { rows } = await read<{ id: string; received_at: string }>(
    sql`/* readCopyrightStaffQueueCursorRows */
      SELECT id, to_char(
        received_at AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS received_at
      FROM copyright_notices
      WHERE id = ANY(${noticeIds}::uuid[])
      ORDER BY received_at, id`,
  )
  return rows
}

export async function readCopyrightNoticeTargetIds(noticeId: string): Promise<string[]> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightNoticeTargetIds */
    SELECT id FROM copyright_notice_targets WHERE copyright_notice_id = ${noticeId} ORDER BY id`)
  return rows.map(row => row.id)
}

export async function countCopyrightActiveRestrictionsForNotice(noticeId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countCopyrightActiveRestrictionsForNotice */
    SELECT count(*)::integer AS count
    FROM copyright_restrictions restriction
    JOIN copyright_notice_targets target ON target.id = restriction.copyright_notice_target_id
    WHERE target.copyright_notice_id = ${noticeId} AND restriction.lifted_at IS NULL`)
  return rows[0]!.count
}

export async function readCopyrightEnforcementRequest(assessmentId: string): Promise<{
  state: 'pending' | 'claimed' | 'completed'
  completed_at: Date | null
} | null> {
  const { rows } = await write<{
    state: 'pending' | 'claimed' | 'completed'
    completed_at: Date | null
  }>(sql`/* readCopyrightEnforcementRequest */
    SELECT state, completed_at
    FROM copyright_notice_enforcement_requests
    WHERE copyright_notice_submission_assessment_id = ${assessmentId}`)
  return rows[0] ?? null
}

export async function failTestCopyrightDeliveryIntent(intentId: string): Promise<void> {
  const { rowCount } = await write(sql`/* failTestCopyrightDeliveryIntent */
    UPDATE copyright_notice_delivery_intents
    SET state = 'failed', claimed_at = NULL,
      delivery_attempted_at = COALESCE(delivery_attempted_at, CURRENT_TIMESTAMP),
      failed_at = CURRENT_TIMESTAMP, next_attempt_at = NULL,
      delivery_attempt_count = GREATEST(delivery_attempt_count, 5)
    WHERE id = ${intentId} AND sent_at IS NULL AND bounced_at IS NULL
      AND state IN ('pending', 'claimed')
  `)
  if (!rowCount) throw new Error(`Copyright delivery intent ${intentId} could not be marked failed`)
}

export async function readTestCopyrightActionIntentState(intentId: string): Promise<string | null> {
  const { rows } = await read<{ state: string }>(sql`/* readTestCopyrightActionIntentState */
    SELECT state FROM copyright_notice_action_intents WHERE id = ${intentId}
  `)
  return rows[0]?.state ?? null
}

export async function countTestCopyrightLifecycleEvents(input: {
  noticeId: string
  eventType: string
  actorUserId: string
}): Promise<number> {
  const { rows } = await read<{ count: number }>(sql`/* countTestCopyrightLifecycleEvents */
    SELECT count(*)::integer AS count
    FROM copyright_notice_lifecycle_events
    WHERE copyright_notice_id = ${input.noticeId}
      AND event_type = ${input.eventType}
      AND actor_user_id = ${input.actorUserId}
  `)
  return rows[0]?.count ?? 0
}
