import { read, type QueryOptions } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { caseEntityFkColumn, type ModerationCase, type ModerationCaseEntity } from './config.mts'

export async function findMostRecentCaseForEntity(
  entity: ModerationCaseEntity,
  queryOptions?: QueryOptions,
): Promise<ModerationCase | null> {
  const fkColumn = caseEntityFkColumn(entity.entityType)
  const query = sql`/* findMostRecentCaseForEntity */ SELECT id, post_id, reported_user_id, hostname_id, rss_feed_item_id, uuid_extract_timestamp(id) AS created_at, updated_at, resolved_at, resolved_by_id FROM moderation_cases WHERE `
  query.append(fkColumn)
  query.append(sql` = ${entity.entityId}::uuid ORDER BY id DESC LIMIT 1`)
  const { rows } = await read<ModerationCase>(query, queryOptions)
  return rows[0] ?? null
}
