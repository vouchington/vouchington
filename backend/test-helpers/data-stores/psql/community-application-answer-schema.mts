import { write } from '@data-stores/psql'
import { insertTestCommunity } from '../../entities/communities.mts'
import { createTestUser } from '../../entities/users.mts'

export type ApplicationFieldType =
  | 'short_text'
  | 'long_text'
  | 'single_select'
  | 'multi_select'
  | 'checkbox'

export async function seedCommunity() {
  const user = await createTestUser()
  const community = await insertTestCommunity({ createdById: user.id, visibility: 'private' })
  return { user, community }
}

export async function insertQuestion(
  communityId: string,
  fieldType: ApplicationFieldType,
  orderIndex = 0,
): Promise<string> {
  const { rows } = await write(
    `/* insertCommunityApplicationQuestion */
      INSERT INTO community_application_questions (
        community_id, question, field_type, order_index, required
      )
      VALUES ($1, 'Question', $2::community_application_question_field_types, $3, false)
      RETURNING id`,
    [communityId, fieldType, orderIndex],
  )
  return (rows[0] as { id: string }).id
}

export async function insertOption(
  communityId: string,
  questionId: string,
  fieldType: ApplicationFieldType,
  label: string,
  orderIndex = 0,
): Promise<string> {
  const { rows } = await write(
    `/* insertCommunityApplicationOption */
      INSERT INTO community_application_question_options (
        community_id, question_id, question_field_type, label, order_index
      )
      VALUES ($1, $2, $3::community_application_question_field_types, $4, $5)
      RETURNING id`,
    [communityId, questionId, fieldType, label, orderIndex],
  )
  return (rows[0] as { id: string }).id
}

export async function insertApplication(communityId: string, userId: string): Promise<string> {
  const { rows } = await write(
    `/* insertCommunityApplication */
      INSERT INTO community_applications (community_id, user_id)
      VALUES ($1, $2)
      RETURNING id`,
    [communityId, userId],
  )
  return (rows[0] as { id: string }).id
}

export async function insertAnswer(
  applicationId: string,
  communityId: string,
  questionId: string,
  fieldType: ApplicationFieldType,
  isNull: boolean,
  textValue: string | null,
  booleanValue: boolean | null,
): Promise<string> {
  const { rows } = await write(
    `/* insertCommunityApplicationAnswer */
      INSERT INTO community_application_answers (
        application_id, community_id, question_id, question_field_type,
        is_null, text_value, boolean_value
      )
      VALUES ($1, $2, $3, $4::community_application_question_field_types, $5, $6, $7)
      RETURNING id`,
    [applicationId, communityId, questionId, fieldType, isNull, textValue, booleanValue],
  )
  return (rows[0] as { id: string }).id
}
