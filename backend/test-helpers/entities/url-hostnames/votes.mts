import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function setUrlHostnameVotes(
  hostnameId: string,
  countUp: number,
  countDown: number,
): Promise<void> {
  await write(sql`
    UPDATE url_hostnames
    SET votes_score_up = ${countUp},
        votes_score_down = ${countDown},
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
