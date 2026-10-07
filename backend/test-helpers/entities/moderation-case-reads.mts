import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  caseEntityFkColumn,
  type ModerationCaseEntity,
} from '@voucha/types/entities/moderation-case'

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
