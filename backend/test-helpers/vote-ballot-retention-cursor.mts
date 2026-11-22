import type { TransactionQuery } from '@data-stores/psql'

export async function resetTestVoteBallotCleanupCursor(
  query: TransactionQuery,
  voteTable: string,
  cursorVoteId: string | null = null,
): Promise<void> {
  await query(
    `/* resetTestVoteBallotCleanupCursor */
     INSERT INTO vote_ballot_cleanup_cursors (family, cursor_vote_id, sweep_cutoff_id)
     VALUES ($1::vote_ballot_cleanup_families, $2::uuid, NULL)
     ON CONFLICT (family) DO UPDATE
       SET cursor_vote_id = EXCLUDED.cursor_vote_id, sweep_cutoff_id = NULL`,
    [voteTable, cursorVoteId],
  )
}

export async function getTestVoteBallotCleanupCursor(
  query: TransactionQuery,
  voteTable: string,
): Promise<{ cursor_vote_id: string | null; sweep_cutoff_id: string | null }> {
  const { rows } = await query<{
    cursor_vote_id: string | null
    sweep_cutoff_id: string | null
  }>(
    `/* getTestVoteBallotCleanupCursor */
     SELECT cursor_vote_id, sweep_cutoff_id
     FROM vote_ballot_cleanup_cursors WHERE family = $1::vote_ballot_cleanup_families`,
    [voteTable],
  )
  return rows[0]!
}

export async function setTestVoteBallotSweepCutoff(
  query: TransactionQuery,
  voteTable: string,
  cutoffId: string,
): Promise<void> {
  await query(
    `/* setTestVoteBallotSweepCutoff */
     UPDATE vote_ballot_cleanup_cursors SET sweep_cutoff_id = $2::uuid
     WHERE family = $1::vote_ballot_cleanup_families`,
    [voteTable, cutoffId],
  )
}

export async function lockTestVoteBallotCleanupCursor(
  query: TransactionQuery,
  voteTable: string,
): Promise<void> {
  await query(
    `/* lockTestVoteBallotCleanupCursor */
     SELECT family FROM vote_ballot_cleanup_cursors
     WHERE family = $1::vote_ballot_cleanup_families FOR UPDATE`,
    [voteTable],
  )
}

export async function deleteTestVoteBallotCleanupCursor(
  query: TransactionQuery,
  voteTable: string,
): Promise<void> {
  await query(
    `/* deleteTestVoteBallotCleanupCursor */
     DELETE FROM vote_ballot_cleanup_cursors WHERE family = $1::vote_ballot_cleanup_families`,
    [voteTable],
  )
}
