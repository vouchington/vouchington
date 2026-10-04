import { read, write } from '@data-stores/psql'
import {
  encodeScopedPreciseTimestampCursor,
  encodeScopedTierPreciseUuidCursor,
} from '@modules/pagination'
import { copyrightStaffQueueCursorScope } from '../../../services/copyright-notices/read-models-staff.mts'
import { copyrightStaffQueueKeysSql } from '../../../services/copyright-notices/read-models-staff-queue-sql.mts'
import { copyrightAcceptedNoticeCursorScope } from '../../../services/copyright-notices/read-models.mts'
import sql from 'sql-template-strings'

export async function readCopyrightNoticeTargetId(noticeId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightNoticeTargetId */
    SELECT id FROM copyright_notice_targets WHERE copyright_notice_id = ${noticeId}
    ORDER BY id LIMIT 1`)
  if (!rows[0]) throw new Error(`Copyright notice has no target: ${noticeId}`)
  return rows[0].id
}

export async function readCopyrightAcceptedNoticeCursorBefore(noticeId: string): Promise<string> {
  const { rows } = await read<{ id: string; cursor_accepted_at: string }>(
    sql`/* readCopyrightAcceptedNoticeCursorBefore */
      SELECT notice.id, to_char(
        (notice.accepted_at + interval '1 microsecond') AT TIME ZONE 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
      ) AS cursor_accepted_at
      FROM copyright_notices notice
      WHERE notice.id = ${noticeId} AND notice.accepted_at IS NOT NULL`,
  )
  if (!rows[0]) throw new Error(`Accepted copyright notice not found: ${noticeId}`)
  return encodeScopedPreciseTimestampCursor(
    rows[0].cursor_accepted_at,
    rows[0].id,
    copyrightAcceptedNoticeCursorScope,
  )
}

/**
 * Staff-queue `after` cursor whose first page starts at the first-queued of `noticeIds`. The queue
 * is global and the test database is shared and never cleaned, so a test that reads from the queue
 * head sees other tests' cases; seeking one microsecond before its own first queue key
 * `(tier, waiting_since, id)` keeps every page on rows at or after it.
 */
export async function readCopyrightStaffQueueCursorBefore(
  noticeIds: string[],
  { trustedFlaggerBoost = false }: { trustedFlaggerBoost?: boolean } = {},
): Promise<string> {
  const [first] = await readCopyrightStaffQueueCursorRows(noticeIds, 1, { trustedFlaggerBoost })
  if (!first) throw new Error('Copyright staff queue fixture has no queued notices')
  return encodeScopedTierPreciseUuidCursor(
    first.waiting_since_before,
    first.tier,
    first.id,
    copyrightStaffQueueCursorScope,
  )
}

/** Queue keys of the given queued notices, in queue order. */
export async function readCopyrightStaffQueueCursorRows(
  noticeIds: string[],
  limit = noticeIds.length,
  { trustedFlaggerBoost = false }: { trustedFlaggerBoost?: boolean } = {},
): Promise<
  Array<{
    id: string
    urgency: number
    tier: number
    waiting_since: string
    waiting_since_before: string
  }>
> {
  const { rows } = await read<{
    id: string
    urgency: number
    tier: number
    waiting_since: string
    waiting_since_before: string
  }>(
    sql`/* readCopyrightStaffQueueCursorRows */`.append(
      copyrightStaffQueueKeysSql({ trustedFlaggerBoost }),
    ).append(sql`
      SELECT id, urgency, tier,
        to_char(waiting_since AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS waiting_since,
        to_char(
          (waiting_since - interval '1 microsecond') AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) AS waiting_since_before
      FROM queue_key
      WHERE id = ANY(${noticeIds}::uuid[])
      ORDER BY tier, queue_key.waiting_since, id
      LIMIT ${limit}`),
  )
  return rows
}

/** Queue keys that name no case; a reply to a declined email intake must never become one. */
export async function countCopyrightStaffQueueKeysWithoutNotice(): Promise<number> {
  const { rows } = await read<{ count: number }>(
    sql`/* countCopyrightStaffQueueKeysWithoutNotice */`
      .append(copyrightStaffQueueKeysSql())
      .append(sql`SELECT count(*)::int AS count FROM queue_key WHERE id IS NULL`),
  )
  return rows[0]!.count
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
    FROM copyright_notice_lifecycle_changes
    WHERE copyright_notice_id = ${input.noticeId}
      AND change_type = ${input.eventType}
      AND changed_by_id = ${input.actorUserId}
  `)
  return rows[0]?.count ?? 0
}

export async function failTestCopyrightActionIntent(intentId: string): Promise<void> {
  const { rowCount } = await write(sql`/* failTestCopyrightActionIntent */
    UPDATE copyright_notice_action_intents SET state = 'failed', claimed_at = NULL,
      completed_at = CURRENT_TIMESTAMP, completed_at_reason = 'failed', next_attempt_at = NULL,
      lease_token = NULL
    WHERE id = ${intentId} AND state IN ('pending', 'claimed')`)
  if (!rowCount) throw new Error('Copyright action intent was not marked failed')
}
