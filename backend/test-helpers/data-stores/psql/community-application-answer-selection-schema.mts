import { beginTransaction, type QueryExecutor } from '@data-stores/psql'
import { insertAnswer, type ApplicationFieldType } from './community-application-answer-schema.mts'

type SelectFieldType = Extract<ApplicationFieldType, 'single_select' | 'multi_select'>

export type SelectAnswerRef = {
  id: string
  applicationId: string
  communityId: string
  questionId: string
  fieldType: SelectFieldType
}

export async function insertSelectAnswer(
  query: QueryExecutor,
  applicationId: string,
  communityId: string,
  questionId: string,
  fieldType: SelectFieldType,
  isNull = false,
): Promise<SelectAnswerRef> {
  const { rows } = await query(
    `/* insertSelectAnswer */
      INSERT INTO community_application_answers (
        application_id, community_id, question_id, question_field_type,
        is_null, text_value, boolean_value
      )
      VALUES ($1, $2, $3, $4::community_application_question_field_types, $5, NULL, NULL)
      RETURNING id`,
    [applicationId, communityId, questionId, fieldType, isNull],
  )
  return {
    id: (rows[0] as { id: string }).id,
    applicationId,
    communityId,
    questionId,
    fieldType,
  }
}

export async function insertSelection(
  query: QueryExecutor,
  answer: SelectAnswerRef,
  optionId: string,
  orderIndex = 0,
): Promise<void> {
  await query(
    `/* insertAnswerSelection */
      INSERT INTO community_application_answer_selections (
        application_answer_id, application_id, community_id, question_id,
        question_field_type, option_id, order_index
      )
      VALUES ($1, $2, $3, $4, $5::community_application_question_field_types, $6, $7)`,
    [
      answer.id,
      answer.applicationId,
      answer.communityId,
      answer.questionId,
      answer.fieldType,
      optionId,
      orderIndex,
    ],
  )
}

export async function insertCommittedSelectAnswer(
  applicationId: string,
  communityId: string,
  questionId: string,
  fieldType: SelectFieldType,
): Promise<SelectAnswerRef> {
  const id = await insertAnswer(
    applicationId,
    communityId,
    questionId,
    fieldType,
    false,
    null,
    null,
  )
  return { id, applicationId, communityId, questionId, fieldType }
}

export async function insertCommittedSingleSelection(
  applicationId: string,
  communityId: string,
  questionId: string,
  optionId: string,
): Promise<SelectAnswerRef> {
  await using query = await beginTransaction()
  const answer = await insertSelectAnswer(
    query,
    applicationId,
    communityId,
    questionId,
    'single_select',
  )
  await insertSelection(query, answer, optionId)
  await query.commit()
  return answer
}

export async function moveSelectionToOtherApplication(
  sourceAnswerId: string,
  destinationAnswerId: string,
  destinationApplicationId: string,
): Promise<void> {
  await using move = await beginTransaction()
  await move(
    `/* deleteDestinationSelection */
      DELETE FROM community_application_answer_selections
      WHERE application_answer_id = $1`,
    [destinationAnswerId],
  )
  await move(
    `/* moveSelectionToOtherApplication */
      UPDATE community_application_answer_selections
      SET application_answer_id = $1, application_id = $2
      WHERE application_answer_id = $3`,
    [destinationAnswerId, destinationApplicationId, sourceAnswerId],
  )
  await move.commit()
}
