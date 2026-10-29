import type { TransactionQuery } from '@data-stores/psql'

export const POST_VOTE_RETENTION_TALLY_SQL = `, tallied AS (
  INSERT INTO post_vote_retained_daily_counts (day, count)
  SELECT (uuid_extract_timestamp(id) AT TIME ZONE 'UTC')::date, COUNT(*)
  FROM deleted
  WHERE score IS NOT NULL AND NOT (score IN (-2, 2) AND NOT score_is_semantic)
  GROUP BY 1
  ORDER BY 1
  ON CONFLICT (day) DO UPDATE
    SET count = post_vote_retained_daily_counts.count + EXCLUDED.count
  RETURNING day
)`

export type VoteBallotSupersederCandidate = {
  id: string
  entity_id: string
  user_id: string
  has_older: boolean
}

export async function listVoteBallotSupersederCandidates(
  query: TransactionQuery,
  table: string,
  entityColumn: string,
  cutoffId: string,
  voteIds: readonly string[] | undefined,
  cursorVoteId: string | null,
  limit: number,
): Promise<VoteBallotSupersederCandidate[]> {
  const selection = voteIds
    ? { predicate: 'vote.id = ANY($2::uuid[])', arguments: [cutoffId, voteIds, limit] }
    : {
        predicate: 'vote.id > $2::uuid',
        arguments: [cutoffId, cursorVoteId ?? '00000000-0000-7000-8000-000000000000', limit],
      }
  const { rows } = await query<VoteBallotSupersederCandidate>(
    `/* listVoteBallotCleanupCandidates */
     SELECT vote.id, vote.${entityColumn} AS entity_id, vote.user_id,
       EXISTS (
         SELECT 1 FROM ${table} older
         WHERE older.${entityColumn} = vote.${entityColumn}
           AND older.user_id = vote.user_id AND older.id < vote.id
           ${table === 'post_votes' ? 'AND older.ballot_retention_deferred_at IS NULL' : ''}
         LIMIT 1
       ) AS has_older
     FROM ${table} vote
     WHERE vote.id < $1::uuid
       AND ${selection.predicate}
     ORDER BY vote.id LIMIT $3`,
    selection.arguments,
  )
  return rows
}
