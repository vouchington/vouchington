import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  caseEntityFkColumn,
  type ModerationCase,
  type ModerationCaseEntity,
} from '@voucha/types/entities/moderation-case'

export async function getTestModerationCaseById(caseId: string): Promise<ModerationCase | null> {
  const { rows } = await read<ModerationCase>(
    sql`/* getTestModerationCaseById */
    SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id,
           uuid_extract_timestamp(id) AS created_at, updated_at, resolved_at, resolved_by_id
    FROM moderation_cases
    WHERE id = ${caseId}
    LIMIT 1
  `,
  )
  return rows[0] ?? null
}

export type TestModerationCaseState = {
  id: string
  resolved_at: Date | null
  resolved_by_id: string | null
}

/** Reads every case owned by one fixture entity from the primary. */
export async function listTestModerationCasesForEntity(
  entity: ModerationCaseEntity,
): Promise<TestModerationCaseState[]> {
  const query = sql`/* listTestModerationCasesForEntity */
    SELECT id, resolved_at, resolved_by_id FROM moderation_cases WHERE `
  query.append(caseEntityFkColumn(entity.entityType))
  query.append(sql` = ${entity.entityId}::uuid ORDER BY id`)
  const { rows } = await write<TestModerationCaseState>(query)
  return rows
}

/** Resolves the case owned by a warning fixture before testing an appeal reopen. */
export async function resolveTestModerationCase(
  caseId: string,
  staffUserId: string,
): Promise<void> {
  await write(sql`/* resolveTestModerationCase */
    UPDATE moderation_cases SET resolved_at = CURRENT_TIMESTAMP, resolved_by_id = ${staffUserId}
    WHERE id = ${caseId} AND resolved_at IS NULL
  `)
}
