import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMinUuidv7ForDate } from '@modules/utils'
import { MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS } from '@services/ap-inbox-activities/config'
import { POST_VOTE_RETENTION_TALLY_SQL } from './cleanup-vote-ballot-candidates.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

type DeferredPostVotePage = { scanned: number; deleted: number; hasMore: boolean }

/** A partial ID index caps the due-source read before supersession is rechecked. */
export async function cleanupDeferredPostVoteBallots(
  batchSize: number,
  now: Date,
  options: { query?: TransactionQuery; voteIds?: readonly string[] } = {},
): Promise<DeferredPostVotePage> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5_000)
    throw new RangeError('Deferred post ballot batch size must be between 1 and 5000')
  if (options.voteIds && options.voteIds.length > batchSize)
    throw new RangeError('Scoped deferred post ballots must fit one page')
  if (options.voteIds?.length === 0) return { scanned: 0, deleted: 0, hasMore: false }
  const cutoffId = getMinUuidv7ForDate(
    new Date(now.getTime() - MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS * DAY_MS),
  )
  await using ownedQuery = options.query ? undefined : await beginTransaction()
  const query = options.query ?? ownedQuery!
  const delivered = await cleanupDeferredPostVotePage(query, batchSize, null, options.voteIds)
  const expired = await cleanupDeferredPostVotePage(query, batchSize, cutoffId, options.voteIds)
  if (ownedQuery) await ownedQuery.commit()
  return {
    scanned: delivered.scanned + expired.scanned,
    deleted: delivered.deleted + expired.deleted,
    hasMore: delivered.hasMore || expired.hasMore,
  }
}

async function cleanupDeferredPostVotePage(
  query: TransactionQuery,
  batchSize: number,
  cutoffId: string | null,
  voteIds?: readonly string[],
): Promise<DeferredPostVotePage> {
  const parameters: unknown[] = []
  const due =
    cutoffId === null
      ? 'vote.outbound_activitypub_distributed_at IS NOT NULL'
      : `vote.id < $${parameters.push(cutoffId)}::uuid`
  const scope =
    voteIds === undefined ? '' : `AND vote.id = ANY($${parameters.push(voteIds)}::uuid[])`
  const limit = parameters.push(batchSize)
  const { rows } = await query<{ deleted: number; released: number }>(
    `/* cleanupDeferredPostVotePage */
     WITH candidates AS (
       SELECT vote.post_id, vote.id, vote.user_id FROM post_votes vote
       WHERE vote.ballot_retention_deferred_at IS NOT NULL AND ${due} ${scope}
       ORDER BY vote.id LIMIT $${limit}
     ), classified AS (
       SELECT candidate.post_id, candidate.id, candidate.user_id,
         EXISTS (
           SELECT 1 FROM post_votes newer
           WHERE newer.post_id = candidate.post_id AND newer.user_id = candidate.user_id
             AND newer.id > candidate.id
           LIMIT 1
         ) AS superseded
       FROM candidates candidate
     ), deleted AS (
       DELETE FROM post_votes vote USING classified candidate
       WHERE vote.post_id = candidate.post_id AND vote.id = candidate.id
         AND vote.user_id IS NOT DISTINCT FROM candidate.user_id AND candidate.superseded
         AND vote.ballot_retention_deferred_at IS NOT NULL AND ${due}
       RETURNING vote.id, vote.score, vote.score_is_semantic
     ), released AS (
       UPDATE post_votes vote SET ballot_retention_deferred_at = NULL
       FROM classified candidate
       WHERE vote.post_id = candidate.post_id AND vote.id = candidate.id
         AND vote.user_id IS NOT DISTINCT FROM candidate.user_id AND NOT candidate.superseded
         AND vote.ballot_retention_deferred_at IS NOT NULL AND ${due}
       RETURNING vote.id
     )${POST_VOTE_RETENTION_TALLY_SQL}
     SELECT (SELECT COUNT(*)::int FROM deleted) AS deleted,
       (SELECT COUNT(*)::int FROM released) AS released`,
    parameters,
  )
  const result = rows[0]!
  const scanned = result.deleted + result.released
  return { scanned, deleted: result.deleted, hasMore: scanned === batchSize }
}
