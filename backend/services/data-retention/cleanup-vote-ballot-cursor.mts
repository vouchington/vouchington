import type { TransactionQuery } from '@data-stores/psql'

export type VoteBallotCleanupCursor = {
  cursor_vote_id: string | null
  sweep_cutoff_id: string
}

type StoredCursor = Omit<VoteBallotCleanupCursor, 'sweep_cutoff_id'> & {
  sweep_cutoff_id: string | null
}

export async function lockVoteBallotCleanupCursor(
  query: TransactionQuery,
  voteTable: string,
  cutoffId: string,
): Promise<VoteBallotCleanupCursor> {
  await query(
    `/* ensureVoteBallotCleanupCursor */ INSERT INTO vote_ballot_cleanup_cursors (family, sweep_cutoff_id)
     VALUES ($1::vote_ballot_cleanup_families, $2::uuid) ON CONFLICT DO NOTHING`,
    [voteTable, cutoffId],
  )
  const { rows } = await query<StoredCursor>(
    `/* lockVoteBallotCleanupCursor */
     SELECT cursor_vote_id, sweep_cutoff_id
     FROM vote_ballot_cleanup_cursors WHERE family = $1::vote_ballot_cleanup_families FOR UPDATE`,
    [voteTable],
  )
  const cursor = rows[0]!
  if (cursor.sweep_cutoff_id !== null) return { ...cursor, sweep_cutoff_id: cursor.sweep_cutoff_id }
  await query(
    `/* startVoteBallotCleanupSweep */ UPDATE vote_ballot_cleanup_cursors
     SET sweep_cutoff_id = $2::uuid WHERE family = $1::vote_ballot_cleanup_families`,
    [voteTable, cutoffId],
  )
  return { ...cursor, sweep_cutoff_id: cutoffId }
}

export async function checkpointVoteBallotCleanupCursor(
  query: TransactionQuery,
  voteTable: string,
  cursorVoteId: string | null,
  hasMore = true,
): Promise<void> {
  await query(
    `/* checkpointVoteBallotCleanupCursor */ UPDATE vote_ballot_cleanup_cursors
     SET cursor_vote_id = $2,
       sweep_cutoff_id = CASE WHEN $3::boolean THEN sweep_cutoff_id ELSE NULL END
     WHERE family = $1::vote_ballot_cleanup_families`,
    [voteTable, cursorVoteId, hasMore],
  )
}
