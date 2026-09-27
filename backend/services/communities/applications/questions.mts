import { read, beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import type { CommunityApplicationQuestion } from '../types.mts'
import {
  assertApplicationQuestionInputs,
  type ApplicationQuestionFieldType,
} from './question-input.mts'

export type { ApplicationQuestionInput } from './question-input.mts'

export async function getApplicationQuestions(
  communityId: string,
  options?: QueryOptions & { lock?: boolean },
): Promise<CommunityApplicationQuestion[]> {
  const statement = sql`/* getApplicationQuestions */
    SELECT
      q.*,
      CASE
        WHEN q.field_type IN ('single_select', 'multi_select') THEN COALESCE(
          (
            SELECT jsonb_agg(o.label ORDER BY o.order_index)
            FROM community_application_question_options o
            WHERE o.question_id = q.id
              AND o.deleted_at IS NULL
          ),
          '[]'::jsonb
        )
        ELSE NULL
      END AS options
    FROM community_application_questions q
    WHERE q.community_id = ${communityId}
      AND q.deleted_at IS NULL
    ORDER BY q.order_index ASC`
  if (options?.lock) statement.append(sql` FOR SHARE OF q`)

  const { rows } = await read(statement, options)
  return rows as CommunityApplicationQuestion[]
}

export async function setApplicationQuestions(
  currentUserId: string,
  communityId: string,
  questions: ApplicationQuestionInput[],
): Promise<CommunityApplicationQuestion[]> {
  const [community, membership] = await Promise.all([
    getCommunity(communityId),
    getCommunityMember(communityId, currentUserId),
  ])
  assert(community, 404, 'Community not found')
  assert(!community.archived_at, 403, 'Community is archived')
  assert(membership?.role === 'owner', 403, 'Only owners can set application questions')
  assertApplicationQuestionInputs(questions)

  await using query = await beginTransaction()

  const options = { query }

  // Soft-delete existing questions
  await write(
    sql`/* setApplicationQuestions */
      UPDATE community_application_questions
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE community_id = ${communityId}
        AND deleted_at IS NULL
      `,
    options,
  )

  await write(
    sql`/* setApplicationQuestions */
      UPDATE community_application_question_options o
      SET deleted_at = CURRENT_TIMESTAMP
      FROM community_application_questions q
      WHERE q.id = o.question_id
        AND q.community_id = ${communityId}
        AND q.deleted_at IS NOT NULL
        AND o.deleted_at IS NULL
      `,
    options,
  )

  if (questions.length === 0) {
    await query.commit()
    return []
  }
  const { rows } = await write(
    sql`/* setApplicationQuestions */
      INSERT INTO community_application_questions (community_id, question, field_type, order_index, required)
      SELECT ${communityId}, question, field_type, order_index, required
      FROM UNNEST(
        ${questions.map(q => q.question)}::text[],
        ${questions.map(q => q.field_type)}::community_application_question_field_types[],
        ${questions.map((_, i) => i)}::smallint[],
        ${questions.map(q => q.required ?? true)}::boolean[]
      ) AS t(question, field_type, order_index, required)
      RETURNING *
      `,
    options,
  )

  const insertedQuestions = rows as Array<CommunityApplicationQuestion & { order_index: number }>
  insertedQuestions.sort((a, b) => a.order_index - b.order_index)

  const optionQuestionIds: string[] = []
  const optionFieldTypes: ApplicationQuestionFieldType[] = []
  const optionLabels: string[] = []
  const optionOrderIndexes: number[] = []
  for (const [questionIndex, question] of questions.entries()) {
    for (const [optionIndex, label] of (question.options ?? []).entries()) {
      optionQuestionIds.push(insertedQuestions[questionIndex]!.id)
      optionFieldTypes.push(question.field_type)
      optionLabels.push(label)
      optionOrderIndexes.push(optionIndex)
    }
  }

  if (optionLabels.length > 0) {
    await write(
      sql`/* setApplicationQuestions */
        INSERT INTO community_application_question_options (
          community_id,
          question_id,
          question_field_type,
          label,
          order_index
        )
        SELECT ${communityId}, question_id, question_field_type, label, order_index
        FROM UNNEST(
          ${optionQuestionIds}::uuid[],
          ${optionFieldTypes}::community_application_question_field_types[],
          ${optionLabels}::text[],
          ${optionOrderIndexes}::smallint[]
        ) AS t(question_id, question_field_type, label, order_index)
        `,
      options,
    )
  }

  const result = await getApplicationQuestions(communityId, options)
  await query.commit()
  return result
}
