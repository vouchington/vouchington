import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

// The counts are INT columns. The scores are weighted DOUBLE PRECISION and default to the counts;
// pass `scores` to seed fractional weights.
export async function setUrlHostnameVotes(
  hostnameId: string,
  countUp: number,
  countDown: number,
  scores: { up: number; down: number } = { up: countUp, down: countDown },
): Promise<void> {
  await write(sql`
    UPDATE url_hostnames
    SET votes_score_up = ${scores.up},
        votes_score_down = ${scores.down},
        votes_count_up = ${countUp},
        votes_count_down = ${countDown}
    WHERE id = ${hostnameId}
  `)
}

export async function upsertHostnameVote(
  hostnameId: string,
  userId: string,
  score: number,
  id?: string,
  scoreIsNeutral = false,
  scoreIsSemantic = false,
): Promise<void> {
  await write(sql`/* upsertHostnameVote */
    INSERT INTO hostname_votes (id, hostname_id, user_id, score, score_is_neutral, score_is_semantic)
    VALUES (COALESCE(${id}::uuid, uuidv7()), ${hostnameId}, ${userId}, ${score}, ${scoreIsNeutral}, ${scoreIsSemantic})
  `)
}
