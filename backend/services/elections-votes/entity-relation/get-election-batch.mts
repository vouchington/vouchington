import { read } from '@data-stores/psql'
import { isUUID } from '@modules/utils'
import createError from 'http-errors'
import { entityRelationMetadatum } from '@voucha/types/entities/entity-relations-metadata'
import type { ViewEntityRelationElection } from './types.mts'

const electionTables = entityRelationMetadatum.flatMap(m => (m.election ? [m.table_name] : []))

export async function getEntityRelationElectionsByIdBatch(
  entityRelationIds: string[],
): Promise<Array<ViewEntityRelationElection | null | undefined>> {
  if (entityRelationIds.length === 0) return []

  for (const id of entityRelationIds) {
    if (!isUUID(id)) {
      throw createError(422, `Invalid entity relation ID: ${id}`)
    }
  }

  const positions = entityRelationIds.map((_, index) => index)
  const tableUnions = electionTables.map(
    table =>
      `SELECT 'entity_relation_election' AS __entity_type, t.id, t.votes_score_net, t.votes_count_up, t.votes_count_down, input_data.input_order
      FROM "${table}" t
      JOIN input_data ON t.id = input_data.input_value
      WHERE t.deleted_at IS NULL`,
  )

  const { rows } = await read(
    `/* getEntityRelationElectionsByIdBatch */
    WITH input_data AS (
      SELECT unnest($1::uuid[]) AS input_value,
             unnest($2::int[]) AS input_order
    )
    ${tableUnions.join('\n    UNION ALL\n    ')}
    ORDER BY input_order
  `,
    [entityRelationIds, positions],
  )

  const results: Array<ViewEntityRelationElection | null | undefined> = new Array(
    entityRelationIds.length,
  ).fill(null)
  for (const row of rows) {
    const { input_order, ...data } = row
    results[input_order] = data as ViewEntityRelationElection
  }
  return results
}
