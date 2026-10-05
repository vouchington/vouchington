import { write } from '@data-stores/psql'
import { insertTestCommunity } from '../../entities/communities.mts'
import { createTestUser } from '../../entities/users.mts'

export async function seedCommunity() {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id, visibility: 'private' })
  return { user, community }
}

export async function insertQuestion(communityId: string, orderIndex = 0): Promise<string> {
  const { rows } = await write(
    `/* insertCommunityApplicationQuestion */
      INSERT INTO community_application_questions (community_id, question, order_index, is_required)
      VALUES ($1, 'Question', $2, false)
      RETURNING id`,
    [communityId, orderIndex],
  )
  return (rows[0] as { id: string }).id
}

export async function insertApplication(communityId: string, userId: string): Promise<string> {
  const { rows } = await write(
    `/* insertCommunityApplication */
      INSERT INTO community_applications (created_via, community_id, user_id)
      VALUES ('system', $1, $2)
      RETURNING id`,
    [communityId, userId],
  )
  return (rows[0] as { id: string }).id
}

/** Inserts one raw answer row; `value` is serialized to jsonb exactly as given. */
export async function insertAnswer(
  applicationId: string,
  communityId: string,
  questionId: string,
  value: unknown,
): Promise<void> {
  await write(
    `/* insertCommunityApplicationAnswer */
      INSERT INTO community_application_answers (application_id, community_id, question_id, value)
      VALUES ($1, $2, $3, $4::jsonb)`,
    [applicationId, communityId, questionId, JSON.stringify(value)],
  )
}
