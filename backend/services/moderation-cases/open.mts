import assert from 'node:assert/strict'
import { read, write, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { caseEntityFkColumn, type ModerationCase, type ModerationCaseEntity } from './config.mts'

/** Opens a case or reads the concurrent winner without aborting the caller's transaction. */
export async function openOrGetOpenCase(
  entity: ModerationCaseEntity,
  queryOptions?: QueryOptions,
): Promise<string> {
  const existing = await findOpenCaseForEntity(entity, queryOptions)
  if (existing) return existing.id

  const fkColumn = caseEntityFkColumn(entity.entityType)
  const insertQuery = sql`/* openOrGetOpenCase:insert */ INSERT INTO moderation_cases (`
  insertQuery.append(fkColumn)
  insertQuery.append(sql`) VALUES (${entity.entityId}::uuid) ON CONFLICT (`)
  insertQuery.append(fkColumn)
  insertQuery.append(sql`) WHERE `)
  insertQuery.append(fkColumn)
  insertQuery.append(sql` IS NOT NULL AND resolved_at IS NULL DO NOTHING RETURNING id`)
  const { rows } = await write<{ id: string }>(insertQuery, queryOptions)
  if (rows[0]) return rows[0].id

  // A separate statement sees the winning insert on READ COMMITTED; use the primary or caller.
  const selectQuery = sql`/* openOrGetOpenCase:raceRetry */ SELECT id FROM moderation_cases WHERE `
  selectQuery.append(fkColumn)
  selectQuery.append(sql` = ${entity.entityId}::uuid AND resolved_at IS NULL LIMIT 1`)
  const { rows: winnerRows } = await write<{ id: string }>(selectQuery, queryOptions)
  assert(winnerRows[0], 'Concurrent open moderation case disappeared')
  return winnerRows[0].id
}

export async function findOpenCaseForEntity(
  entity: ModerationCaseEntity,
  queryOptions?: QueryOptions,
): Promise<ModerationCase | null> {
  const fkColumn = caseEntityFkColumn(entity.entityType)
  const query = sql`/* findOpenCaseForEntity */ SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id, uuid_extract_timestamp(id) AS created_at, updated_at, resolved_at, resolved_by_id FROM moderation_cases WHERE `
  query.append(fkColumn)
  query.append(sql` = ${entity.entityId}::uuid AND resolved_at IS NULL LIMIT 1`)
  const { rows } = await read<ModerationCase>(query, queryOptions)
  return rows[0] ?? null
}
