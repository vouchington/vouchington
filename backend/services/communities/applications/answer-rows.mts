import { write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import type { PreparedApplicationAnswer } from './answers.mts'

export async function insertApplicationAnswers(
  applicationId: string,
  communityId: string,
  prepared: PreparedApplicationAnswer[],
  options: QueryOptions,
): Promise<void> {
  if (prepared.length === 0) return
  const { rowCount } = await write(
    sql`/* insertApplicationAnswers */
      INSERT INTO community_application_answers (
        application_id,
        community_id,
        question_id,
        question_field_type,
        is_null,
        text_value,
        boolean_value
      )
      SELECT
        ${applicationId},
        ${communityId},
        input.question_id,
        input.field_type,
        input.is_null,
        input.text_value,
        input.boolean_value
      FROM jsonb_to_recordset(${JSON.stringify(
        prepared.map(answer => ({
          question_id: answer.questionId,
          field_type: answer.fieldType,
          is_null: answer.isNull,
          text_value: answer.textValue,
          boolean_value: answer.booleanValue,
        })),
      )}::jsonb) AS input(
        question_id uuid,
        field_type community_application_question_field_types,
        is_null boolean,
        text_value text,
        boolean_value boolean
      )
    `,
    options,
  )
  assert(rowCount === prepared.length, 422, 'Unknown question')
  await insertApplicationAnswerSelections(applicationId, prepared, options)
}

async function insertApplicationAnswerSelections(
  applicationId: string,
  prepared: PreparedApplicationAnswer[],
  options: QueryOptions,
): Promise<void> {
  const selections = prepared.flatMap(answer =>
    answer.optionLabels.map((label, orderIndex) => ({
      question_id: answer.questionId,
      label,
      order_index: orderIndex,
    })),
  )
  if (selections.length === 0) return
  const { rowCount } = await write(
    sql`/* insertApplicationAnswerSelections */
      INSERT INTO community_application_answer_selections (
        application_answer_id,
        application_id,
        community_id,
        question_id,
        question_field_type,
        option_id,
        order_index
      )
      SELECT
        answer.id,
        answer.application_id,
        answer.community_id,
        answer.question_id,
        answer.question_field_type,
        option.id,
        input.order_index
      FROM jsonb_to_recordset(${JSON.stringify(selections)}::jsonb) AS input(
        question_id uuid,
        label text,
        order_index smallint
      )
      JOIN community_application_answers answer
        ON answer.application_id = ${applicationId}
       AND answer.question_id = input.question_id
      JOIN community_application_question_options option
        ON option.question_id = input.question_id
       AND option.community_id = answer.community_id
       AND option.label = input.label
       AND option.deleted_at IS NULL
    `,
    options,
  )
  assert(rowCount === selections.length, 422, 'Unknown option')
}
