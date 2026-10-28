import {
  beginTransaction,
  assertWhitelistedSqlIdentifier,
  type TransactionQuery,
} from '@data-stores/psql'
import {
  VOTE_ENTITY_ID_COLUMN_IDENTIFIERS,
  VOTE_TABLE_IDENTIFIERS,
} from '@data-stores/psql/config-driven/utils/election-sql-identifiers'
import { getMinUUIDv7ForDate } from '@modules/utils'
import {
  POST_VOTE_RETENTION_TALLY_SQL,
  listVoteBallotSupersederCandidates,
} from './cleanup-vote-ballot-candidates.mts'
import { voteTables } from './vote-ballot-tables.mts'
import {
  checkpointVoteBallotCleanupCursor,
  lockVoteBallotCleanupCursor,
} from './cleanup-vote-ballot-cursor.mts'

const BALLOT_RETENTION_DAYS = 90
const DAY_MS = 24 * 60 * 60 * 1_000

export type VoteBallotCleanupPage = {
  voteTable: string
  scanned: number
  deleted: number
  hasMore: boolean
}

/** One indexed UUIDv7 page per ballot table; each aged superseder is inspected once. */
export async function cleanupSupersededVoteBallots(
  batchSize: number,
  now = new Date(),
  voteIdsByTable?: Readonly<Record<string, readonly string[]>>,
  tableNames?: readonly string[],
): Promise<VoteBallotCleanupPage[]> {
  const selected = tableNames ? new Set(tableNames) : null
  if (selected && [...selected].some(table => !voteTables.some(config => config.table === table))) {
    throw new RangeError('Unknown ballot table in retention continuation')
  }
  const results: VoteBallotCleanupPage[] = []
  for (const config of voteTables) {
    if (selected && !selected.has(config.table)) continue
    const voteIds = voteIdsByTable ? (voteIdsByTable[config.table] ?? []) : undefined
    // oxlint-disable-next-line no-await-in-loop -- each ballot table owns an independent bounded cursor transaction.
    const page = await cleanupSupersededVoteBallotTable(config.table, batchSize, now, voteIds) // no-mistakes-disable-line query-reached-per-item: fixed schema-declared ballot tables each require one independent capped cursor transaction
    results.push(page)
  }
  return results
}

export async function cleanupSupersededVoteBallotTable(
  voteTable: string,
  batchSize: number,
  now = new Date(),
  voteIds?: readonly string[],
  borrowedQuery?: TransactionQuery,
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
  await using ownedQuery = borrowedQuery ? undefined : await beginTransaction()
  const query = borrowedQuery ?? ownedQuery!
  const cursor = voteIds ? null : await lockVoteBallotCleanupCursor(query, table, cutoffId)
  const sweepCutoffId = cursor?.sweep_cutoff_id ?? cutoffId
  // Both probes have a fixed page plus one lookahead row. The one-row minimum still
  // deletes one old ballot while keeping the total physical read budget finite.
  const candidateLimit = voteIds ? batchSize : Math.max(1, Math.floor(batchSize / 2))
  const olderLimit = voteIds ? batchSize : Math.max(1, batchSize - candidateLimit)
  const candidates = await listVoteBallotSupersederCandidates(
    query,
    table,
    entityColumn,
    sweepCutoffId,
    voteIds,
    cursor?.cursor_vote_id ?? null,
    candidateLimit + 1,
  )
  const candidatePage = candidates.slice(0, candidateLimit)
  const supersederIndex = candidatePage.findIndex(row => row.has_older)
  const superseder = candidatePage[supersederIndex]
  if (!superseder) {
    const hasMore = candidates.length > candidateLimit
    if (!voteIds && candidatePage.length > 0)
      await checkpointVoteBallotCleanupCursor(query, table, candidatePage.at(-1)!.id, hasMore)
    else if (!voteIds && !hasMore)
      await checkpointVoteBallotCleanupCursor(query, table, cursor?.cursor_vote_id ?? null, false)
    if (ownedQuery) await ownedQuery.commit()
    return { voteTable, scanned: candidatePage.length, deleted: 0, hasMore }
  }
  const { rows: olderCandidates } = await query<{ id: string }>(
    `/* listOlderVoteBallotsForSuperseder */
     SELECT old.id FROM ${table} old
     WHERE old.${entityColumn} = $1::uuid AND old.user_id = $2::uuid
       AND old.id < $3::uuid AND old.id < $4::uuid
     ORDER BY old.id LIMIT $5 FOR UPDATE OF old`,
    [superseder.entity_id, superseder.user_id, superseder.id, sweepCutoffId, olderLimit + 1],
  )
  const page = olderCandidates.slice(0, olderLimit)
  const tallySql = voteTable === 'post_votes' ? POST_VOTE_RETENTION_TALLY_SQL : ''
  const { rows: deletedRows } = await query<{ deleted: number }>(
    `/* deleteSupersededVoteBallots */
     /* no-mistakes: deadlock-safe -- one cursor serializes each table; older rows are locked in ID order, and daily aggregate keys are inserted in day order. */
     WITH deleted AS (
       DELETE FROM ${table} old
       WHERE old.${entityColumn} = $1::uuid AND old.user_id = $2::uuid
         AND old.id = ANY($3::uuid[])
         AND EXISTS (SELECT 1 FROM ${table} newer WHERE newer.id = $4::uuid
           AND newer.${entityColumn} = old.${entityColumn} AND newer.user_id = old.user_id)
       RETURNING old.id${voteTable === 'post_votes' ? ', old.score, old.score_is_semantic' : ''}
     )${tallySql}
     SELECT COUNT(*)::int AS deleted FROM deleted`,
    [superseder.entity_id, superseder.user_id, page.map(row => row.id), superseder.id],
  )
  const olderHasMore = olderCandidates.length > olderLimit
  const hasMore = olderHasMore || candidates.length > supersederIndex + 1
  if (!voteIds)
    await checkpointVoteBallotCleanupCursor(
      query,
      table,
      olderHasMore
        ? (candidatePage[supersederIndex - 1]?.id ?? cursor?.cursor_vote_id ?? null)
        : superseder.id,
      hasMore,
    )
  if (ownedQuery) await ownedQuery.commit()
  return {
    voteTable,
    scanned: candidatePage.length + page.length,
    deleted: deletedRows[0]?.deleted ?? 0,
    hasMore,
  }
}
