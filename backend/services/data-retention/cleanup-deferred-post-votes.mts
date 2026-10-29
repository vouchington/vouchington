import { beginTransaction, type TransactionQuery } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import { MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS } from '@services/ap-inbox-activities/config'
import { POST_VOTE_RETENTION_TALLY_SQL } from './cleanup-vote-ballot-candidates.mts'

const DAY_MS = 24 * 60 * 60 * 1_000

type DeferredPostVotePage = { scanned: number; deleted: number; hasMore: boolean }

/** A partial ID index caps the due-source read before supersession is rechecked. */
export async function cleanupDeferredPostVoteBallots(
  batchSize: number,
  now: Date,
  borrowedQuery?: TransactionQuery,
): Promise<DeferredPostVotePage> {
  if (!Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > 5_000)
    throw new RangeError('Deferred post ballot batch size must be between 1 and 5000')
  const cutoffId = getMinUUIDv7ForDate(
    new Date(now.getTime() - MINIMUM_TERMINAL_IDENTITY_RETENTION_DAYS * DAY_MS),
  )
  await using ownedQuery = borrowedQuery ? undefined : await beginTransaction()
  const query = borrowedQuery ?? ownedQuery!
  const delivered = await cleanupDeferredPostVotePage(query, batchSize, null)
  const expired = await cleanupDeferredPostVotePage(query, batchSize, cutoffId)
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
): Promise<DeferredPostVotePage> {
  const { rows: due } = await query<{ post_id: string; id: string }>(
    `/* listDeferredPostVoteSources */
     -- no-mistakes-disable-next-line postgres-required-predicates: this global due-source page spans every post partition; partial ID indexes and LIMIT cap raw reads before supersession checks
     SELECT post_id, id FROM post_votes
     WHERE ballot_retention_deferred_at IS NOT NULL
       AND ${cutoffId === null ? 'outbound_activitypub_distributed_at IS NOT NULL' : 'id < $1::uuid'}
     ORDER BY id LIMIT $${cutoffId === null ? '1' : '2'} FOR UPDATE`,
    cutoffId === null ? [batchSize + 1] : [cutoffId, batchSize + 1],
  )
  const page = due.slice(0, batchSize)
  const postIds = page.map(row => row.post_id)
  const voteIds = page.map(row => row.id)
  const { rows: deletedRows } = await query<{ deleted: number }>(
    `/* deleteDeferredPostVoteSources */
     /* no-mistakes: deadlock-safe -- due rows are locked in ID order; daily aggregate keys are inserted in day order. */
     WITH selected AS (SELECT * FROM unnest($1::uuid[], $2::uuid[]) AS source(post_id, id)),
       deleted AS (
         DELETE FROM post_votes old USING selected
         WHERE old.post_id = selected.post_id AND old.id = selected.id
           AND EXISTS (SELECT 1 FROM post_votes newer
             WHERE newer.post_id = old.post_id AND newer.user_id = old.user_id
               AND newer.id > old.id)
         RETURNING old.id, old.score, old.score_is_semantic
       )${POST_VOTE_RETENTION_TALLY_SQL}
     SELECT COUNT(*)::int AS deleted FROM deleted`,
    [postIds, voteIds],
  )
  // If a formerly superseded row is current again, it is a current ballot and must
  // leave the due index so that the next page can make progress.
  if (page.length > 0)
    await query(
      `/* releaseCurrentDeferredPostVoteSources */
       UPDATE post_votes vote SET ballot_retention_deferred_at = NULL
       FROM unnest($1::uuid[], $2::uuid[]) AS source(post_id, id)
       WHERE vote.post_id = source.post_id AND vote.id = source.id
         AND NOT EXISTS (SELECT 1 FROM post_votes newer
           WHERE newer.post_id = vote.post_id AND newer.user_id = vote.user_id
             AND newer.id > vote.id)`,
      [postIds, voteIds],
    )
  return {
    scanned: page.length,
    deleted: deletedRows[0]?.deleted ?? 0,
    hasMore: due.length > batchSize,
  }
}
