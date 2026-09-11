import { read, write } from '@data-stores/psql'
import sql from 'sql-template-strings'
import {
  caseEntityFkColumn,
  type ModerationCase,
  type ModerationCaseEntity,
} from '@voucha/types/entities/moderation-case'

// Internal support module (leading underscore = not part of the public barrel).
// Duplicates the moderation-cases domain's openOrGetOpenCase/findOpenCaseForEntity so
// test-helpers does not depend on that service package, which would otherwise
// create a workspace dependency cycle (moderation-cases depends on test-helpers for
// its own tests).

/**
 * Returns the ID of the open (unresolved) case for the given entity,
 * creating one if none exists. Handles the INSERT/SELECT race via 23505 retry.
 */
export async function openOrGetOpenCase(entity: ModerationCaseEntity): Promise<string> {
  const existing = await findOpenCaseForEntity(entity)
  if (existing) return existing.id

  const fkColumn = caseEntityFkColumn(entity.entityType)
  const insertQuery = sql`/* openOrGetOpenCase:insert */ INSERT INTO moderation_cases (`
  insertQuery.append(fkColumn)
  insertQuery.append(sql`) VALUES (${entity.entityId}::uuid) RETURNING id`)

  try {
    const { rows } = await write<{ id: string }>(insertQuery)
    return rows[0]!.id
  } catch (err) {
    /* v8 ignore start -- race: concurrent insert won, re-read from primary */
    if ((err as { code?: string }).code === '23505') {
      const selectQuery = sql`/* openOrGetOpenCase:raceRetry */ SELECT id FROM moderation_cases WHERE `
      selectQuery.append(caseEntityFkColumn(entity.entityType))
      selectQuery.append(sql` = ${entity.entityId}::uuid AND resolved_at IS NULL LIMIT 1`)
      const { rows: retryRows } = await write<{ id: string }>(selectQuery)
      if (retryRows[0]) return retryRows[0].id
    }
    throw err
    /* v8 ignore stop */
  }
}

export async function findOpenCaseForEntity(
  entity: ModerationCaseEntity,
): Promise<ModerationCase | null> {
  const fkColumn = caseEntityFkColumn(entity.entityType)
  const query = sql`/* findOpenCaseForEntity */ SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id, uuid_extract_timestamp(id) AS created_at, updated_at, resolved_at, resolved_by_id FROM moderation_cases WHERE `
  query.append(fkColumn)
  query.append(sql` = ${entity.entityId}::uuid AND resolved_at IS NULL LIMIT 1`)
  const { rows } = await read<ModerationCase>(query)
  return rows[0] ?? null
}
