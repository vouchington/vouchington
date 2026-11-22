import type { QueryExecutor } from '@data-stores/psql/types'
import { VOTE_SCHEMA_CONFIGS } from '@data-stores/psql/config-driven/utils/election-schema-config'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'

const ballotFamilies = [
  ...VOTE_SCHEMA_CONFIGS.map(({ voteTable, entityIdColumn }) => ({
    table: voteTable,
    entityColumn: entityIdColumn,
  })),
  ...entityRelationMetadatum.flatMap(metadata =>
    metadata.election
      ? [{ table: getEntityRelationVoteTableName(metadata), entityColumn: 'entity_relation_id' }]
      : [],
  ),
]
export const deletedUserBallotFamilies = ballotFamilies.map(({ table }) => table)

type BallotFamily = { table: string; entityColumn: string }
type BallotKey = { entity_id: string; id: string }
export function getDeletedUserBallotFamily(table: string): BallotFamily {
  const family = ballotFamilies.find(candidate => candidate.table === table)
  if (!family) throw new Error('Unknown deleted-user ballot family')
  return family
}

// Finalization can be waiting for a late ballot after the votes phase has passed.
const initialVoteDrainFinished = `(SELECT completed_at IS NOT NULL OR current_phase = 'finalize'
  FROM user_deletion_requests WHERE user_id = owner.id) IS DISTINCT FROM false`

export async function inspectDeletedUserBallotOwners(
  query: QueryExecutor,
  family: BallotFamily,
  lowerId: string | null,
  upperId: string,
  limit: number,
) {
  const { rows } = await query<{ id: string; has_ballot: boolean }>(
    `/* inspectDeletedUserBallotOwners */
    SELECT owner.id,
      CASE WHEN ${initialVoteDrainFinished} THEN COALESCE((
        SELECT TRUE FROM ${family.table} WHERE user_id = owner.id
        ORDER BY ${family.entityColumn}, id DESC LIMIT 1
      ), false) ELSE false END AS has_ballot
    FROM (
      SELECT id FROM users WHERE deleted_at IS NOT NULL AND id <= $2::uuid
        AND id > COALESCE($1::uuid, '00000000-0000-0000-0000-000000000000'::uuid)
      ORDER BY id LIMIT $3
    ) owner ORDER BY owner.id`,
    [lowerId, upperId, limit],
  )
  return rows
}

export async function selectDeletedUserBallotKeys(
  query: QueryExecutor,
  family: BallotFamily,
  userId: string,
  limit: number,
  cursor: BallotKey | null,
): Promise<BallotKey[]> {
  if (!cursor) return selectKeys(limit)
  // Retain entity ordering for the exact compound index seek, including families with
  // a second (user_id, id) index that lacks this entity in its search key.
  const sameEntity = await selectKeys(
    limit,
    `AND ${family.entityColumn} = ANY($3::uuid[]) AND id < $4::uuid`,
    [[cursor.entity_id], cursor.id],
  )
  const remaining = limit - sameEntity.length
  if (remaining === 0) return sameEntity
  const nextEntities = await selectKeys(remaining, `AND ${family.entityColumn} > $3::uuid`, [
    cursor.entity_id,
  ])
  return [...sameEntity, ...nextEntities]

  async function selectKeys(pageSize: number, continuation = '', bounds: unknown[] = []) {
    const { rows } = await query<BallotKey>(
      `/* selectDeletedUserBallotKeys */
      SELECT ballot.entity_id, ballot.id FROM users owner
      CROSS JOIN LATERAL (
        SELECT ${family.entityColumn} AS entity_id, id
        FROM ${family.table} WHERE user_id = owner.id ${continuation}
        ORDER BY ${family.entityColumn}, id DESC LIMIT $2
      ) ballot
      WHERE owner.id = $1::uuid AND owner.deleted_at IS NOT NULL`,
      [userId, pageSize, ...bounds],
    )
    return rows
  }
}

export async function deleteDeletedUserBallotKeys(
  query: QueryExecutor,
  family: BallotFamily,
  userId: string,
  keys: readonly BallotKey[],
): Promise<number> {
  if (!keys.length) return 0
  const { rowCount } = await query(
    `/* deleteDeletedUserBallotKeys */
    DELETE FROM ${family.table} vote
    USING UNNEST($2::uuid[], $3::uuid[]) as key(entity_id, id)
    WHERE vote.user_id = $1::uuid AND vote.${family.entityColumn} = key.entity_id
      AND vote.id = key.id`,
    [userId, keys.map(key => key.entity_id), keys.map(key => key.id)],
  )
  return rowCount ?? 0
}

/**
 * Deletes one capped page of a soft-deleted user's ballots from the first family that still has
 * any. Returns the number deleted, so finalization can retry once the page made progress.
 */
export async function purgeDeletedUserBallotPage(
  query: QueryExecutor,
  userId: string,
  limit: number,
): Promise<number> {
  const { rows } = await query<{ family: string }>(
    `/* findDeletedUserBallotFamily */ ${ballotFamilies
      .map(
        ({ table }) =>
          `SELECT '${table}' AS family WHERE EXISTS (SELECT 1 FROM ${table} WHERE user_id = $1::uuid)`,
      )
      .join(' UNION ALL ')} LIMIT 1`,
    [userId],
  )
  if (!rows[0]) return 0
  const family = getDeletedUserBallotFamily(rows[0].family)
  const keys = await selectDeletedUserBallotKeys(query, family, userId, limit, null)
  return deleteDeletedUserBallotKeys(query, family, userId, keys)
}
