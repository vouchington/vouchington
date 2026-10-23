import { beginTransaction, assertWhitelistedSqlIdentifier } from '@data-stores/psql'
import { VOTE_SCHEMA_CONFIGS } from '@data-stores/psql/config-driven/utils/election-schema-config'
import {
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  entityRelationMetadatum,
  getEntityRelationVoteTableName,
} from '@voucha/types/entities/entity-relations-metadata'

const BALLOT_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1_000

const voteTables = [
  ...VOTE_SCHEMA_CONFIGS.map(config => ({
    table: config.voteTable,
    entityColumn: config.entityIdColumn,
  })),
  ...entityRelationMetadatum.flatMap(metadata =>
    metadata.election
      ? [{ table: getEntityRelationVoteTableName(metadata), entityColumn: 'entity_relation_id' }]
      : [],
  ),
]

export type VoteBallotCleanupPage = {
  voteTable: string
  scanned: number
  deleted: number
  hasMore: boolean
}

/** One indexed UUIDv7 page per ballot table. Cycles revisit late supersessions. */
export async function cleanupSupersededVoteBallots(
  batchSize: number,
  now = new Date(),
): Promise<VoteBallotCleanupPage[]> {
  const results: VoteBallotCleanupPage[] = []
  for (const config of voteTables) {
    // oxlint-disable-next-line no-await-in-loop -- each ballot table owns an independent bounded cursor transaction.
    results.push(await cleanupSupersededVoteBallotTable(config.table, batchSize, now)) // no-mistakes-disable-line query-reached-per-item: fixed schema-declared ballot tables each require one independent capped cursor transaction
  }
  return results
}

export async function cleanupSupersededVoteBallotTable(
  voteTable: string,
  batchSize: number,
  now = new Date(),
  voteIds?: readonly string[],
): Promise<VoteBallotCleanupPage> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5_000) {
    throw new RangeError('Ballot cleanup batch size must be between 1 and 5000')
  }
  if (voteIds && voteIds.length > batchSize)
    throw new RangeError('Scoped ballots must fit one page')
  const config = voteTables.find(candidate => candidate.table === voteTable)
  if (!config) throw new RangeError(`Unknown ballot table: ${voteTable}`)
  const table = assertWhitelistedSqlIdentifier(voteTable, VOTE_TABLE_IDENTIFIERS, 'voteTable')
  const entityColumn = assertWhitelistedSqlIdentifier(
    config.entityColumn,
    VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
    'entityColumn',
  )
  const cutoffId = getMinUUIDv7ForDate(new Date(now.getTime() - BALLOT_RETENTION_DAYS * DAY_MS))
  await using query = await beginTransaction()
  if (!voteIds)
    await query(
      `/* ensureVoteBallotCleanupCursor */ INSERT INTO vote_ballot_cleanup_cursors (vote_table)
       VALUES ($1) ON CONFLICT DO NOTHING`,
      [table],
    )
  const cursor = voteIds
    ? null
    : (
        await query<{ cursor_vote_id: string | null }>(
          `/* lockVoteBallotCleanupCursor */ SELECT cursor_vote_id
           FROM vote_ballot_cleanup_cursors WHERE vote_table = $1 FOR UPDATE`,
          [table],
        )
      ).rows[0]
  const { rows: candidates } = await query<{ id: string; entity_id: string }>(
    `/* listVoteBallotCleanupCandidates */
     SELECT id, ${entityColumn} AS entity_id FROM ${table}
     WHERE id < $1::uuid
       AND ($2::uuid[] IS NOT NULL AND id = ANY($2::uuid[])
         OR $2::uuid[] IS NULL AND ($3::uuid IS NULL OR id > $3::uuid))
     ORDER BY id LIMIT $4`,
    [cutoffId, voteIds ?? null, cursor?.cursor_vote_id ?? null, batchSize + 1],
  )
  const page = candidates.slice(0, batchSize)
  const { rowCount } = await query(
    `/* deleteSupersededVoteBallots */
     WITH locked AS MATERIALIZED (
       SELECT old.${entityColumn} AS entity_id, old.id, old.user_id
       FROM ${table} old
       JOIN unnest($1::uuid[], $2::uuid[]) candidate(entity_id, id)
         ON candidate.entity_id = old.${entityColumn} AND candidate.id = old.id
       ORDER BY old.${entityColumn}, old.id
       FOR UPDATE OF old SKIP LOCKED
     )
     DELETE FROM ${table} old USING locked
     WHERE old.${entityColumn} = locked.entity_id AND old.id = locked.id
       AND EXISTS (
         SELECT 1 FROM ${table} newer
         WHERE newer.${entityColumn} = locked.entity_id
           AND newer.user_id = locked.user_id
           AND newer.id > locked.id AND newer.id < $3::uuid
         LIMIT 1
       )`,
    [page.map(row => row.entity_id), page.map(row => row.id), cutoffId],
  )
  const hasMore = candidates.length > batchSize
  if (!voteIds)
    await query(
      `/* checkpointVoteBallotCleanupCursor */ UPDATE vote_ballot_cleanup_cursors
       SET cursor_vote_id = $2 WHERE vote_table = $1`,
      [table, hasMore ? page.at(-1)!.id : null],
    )
  await query.commit()
  return { voteTable, scanned: page.length, deleted: rowCount ?? 0, hasMore }
}
