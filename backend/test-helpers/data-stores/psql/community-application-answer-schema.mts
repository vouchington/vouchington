import { read, write } from '@data-stores/psql'
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

export async function countCommunityApplicationAnswers(applicationId: string): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* countCommunityApplicationAnswers */
      SELECT count(*)::int AS count FROM community_application_answers WHERE application_id = $1`,
    [applicationId],
  )
  return rows[0]!.count
}

export async function readCommunityApplicationAnswerValues(
  applicationId: string,
): Promise<{ value: unknown }[]> {
  const { rows } = await read<{ value: unknown }>(
    `/* readCommunityApplicationAnswerValue */
      SELECT value FROM community_application_answers WHERE application_id = $1`,
    [applicationId],
  )
  return rows
}

export async function deleteCommunityApplication(applicationId: string): Promise<void> {
  await write(`/* deleteApplication */ DELETE FROM community_applications WHERE id = $1`, [
    applicationId,
  ])
}

export async function countSurvivingCommunityApplicationQuestions(
  communityId: string,
): Promise<{ count: number }> {
  const { rows } = await read<{ count: number }>(
    `/* countSurvivingQuestions */
      SELECT count(*)::int AS count FROM community_application_questions WHERE community_id = $1`,
    [communityId],
  )
  return rows[0]!
}

export async function deleteCommunityForApplicationTest(communityId: string): Promise<void> {
  await write(`/* deleteCommunity */ DELETE FROM communities WHERE id = $1`, [communityId])
}

export async function countDeletedCommunityApplicationRows(
  communityId: string,
): Promise<{ applications: number; questions: number; answers: number }> {
  const { rows } = await read<{ applications: number; questions: number; answers: number }>(
    `/* countDeletedCommunityApplicationRows */
      SELECT
        (SELECT count(*)::int FROM community_applications WHERE community_id = $1) AS applications,
        (SELECT count(*)::int FROM community_application_questions WHERE community_id = $1) AS questions,
        (SELECT count(*)::int FROM community_application_answers WHERE community_id = $1) AS answers`,
    [communityId],
  )
  return rows[0]!
}

export async function softDeleteCommunityApplicationQuestion(questionId: string): Promise<void> {
  await write(
    `/* softDeleteQuestion */
      UPDATE community_application_questions SET deleted_at = CURRENT_TIMESTAMP WHERE id = $1`,
    [questionId],
  )
}
