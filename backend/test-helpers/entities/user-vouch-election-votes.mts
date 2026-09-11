import { write } from '@data-stores/psql'
import sql from 'sql-template-strings'

export async function insertUserVouchElectionVote(
  userId: string,
  targetUserId: string,
  score: number,
  id?: string,
  scoreIsNeutral = false,
  scoreIsSemantic = false,
): Promise<void> {
  await write(sql`/* insertUserVouchElectionVote */
    INSERT INTO user_vouch_votes (id, user_id, target_user_id, score, score_is_neutral, score_is_semantic)
    VALUES (COALESCE(${id}::uuid, uuidv7()), ${userId}, ${targetUserId}, ${score}, ${scoreIsNeutral}, ${scoreIsSemantic})
  `)
}
