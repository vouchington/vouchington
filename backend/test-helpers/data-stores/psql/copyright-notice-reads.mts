import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function readCopyrightNoticeTargetId(noticeId: string): Promise<string> {
  const { rows } = await read<{ id: string }>(sql`/* readCopyrightNoticeTargetId */
    SELECT id FROM copyright_notice_targets WHERE copyright_notice_id = ${noticeId}
    ORDER BY id LIMIT 1`)
  if (!rows[0]) throw new Error(`Copyright notice has no target: ${noticeId}`)
  return rows[0].id
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
