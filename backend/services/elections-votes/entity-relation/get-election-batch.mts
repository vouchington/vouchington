import { assertWhitelistedSqlIdentifier, read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import type { EntityRelationElectionCacheKey } from '@services/entity-cache/entity-relation-election-key'
import { entityRelationElectionTables } from './target.mts'
import type { ViewEntityRelationElection } from './types.mts'

/**
 * Fetches elections by concrete identity. The same UUID can exist in more than one election
 * relation table, so each input is matched only against its own table and results stay positional.
 */
export async function getEntityRelationElectionsByTargetBatch(
  targets: EntityRelationElectionCacheKey[],
): Promise<Array<ViewEntityRelationElection | null | undefined>> {
  if (targets.length === 0) return []

  for (const { entityRelationId } of targets) {
    if (!isUUID(entityRelationId)) {
      throw createError(422, `Invalid entity relation ID: ${entityRelationId}`)
    }
  }

  const tableSelects = [...new Set(targets.map(target => target.relationTable))].map(
    relationTable => {
      const table = assertWhitelistedSqlIdentifier(
        relationTable,
        entityRelationElectionTables,
        'entityRelationTable',
      )
      return `SELECT 'entity_relation_election' AS __entity_type, t.id, t.votes_score_net, t.votes_count_up, t.votes_count_down, input_data.input_order
      FROM "${table}" t
      JOIN input_data ON t.id = input_data.input_value AND input_data.relation_table = '${table}'
      WHERE t.deleted_at IS NULL`
    },
  )

  const { rows } = await read(
    `/* getEntityRelationElectionsByTargetBatch */
    WITH input_data AS (
      SELECT unnest($1::uuid[]) AS input_value,
             unnest($2::text[]) AS relation_table,
             unnest($3::int[]) AS input_order
    )
    ${tableSelects.join('\n    UNION ALL\n    ')}
    ORDER BY input_order
  `,
    [
      targets.map(target => target.entityRelationId),
      targets.map(target => target.relationTable),
      targets.map((_, index) => index),
    ],
  )

  const results: Array<ViewEntityRelationElection | null | undefined> = new Array(
    targets.length,
  ).fill(null)
  for (const row of rows) {
    const { input_order, ...data } = row
    results[input_order] = data as ViewEntityRelationElection
  }
  return results
}
