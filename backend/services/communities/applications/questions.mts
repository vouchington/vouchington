import { read, beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import type { CommunityApplicationQuestion } from '../types.mts'
import {
  assertApplicationQuestionInputs,
  type ApplicationQuestionInput,
} from './question-input.mts'

export type { ApplicationQuestionInput }

export async function getApplicationQuestions(
  communityId: string,
  options?: QueryOptions & { lock?: boolean },
): Promise<CommunityApplicationQuestion[]> {
  const statement = sql`/* getApplicationQuestions */
    SELECT *
    FROM community_application_questions
    WHERE community_id = ${communityId}
      AND deleted_at IS NULL
    ORDER BY order_index ASC`
  if (options?.lock) statement.append(sql` FOR SHARE`)

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

  if (questions.length === 0) {
    await query.commit()
    return []
  }
  await write(
    sql`/* setApplicationQuestions */
      INSERT INTO community_application_questions (
        community_id, question, field_type, options, order_index, required
      )
      SELECT ${communityId}, question, field_type, options::jsonb, order_index, required
      FROM UNNEST(
        ${questions.map(q => q.question)}::text[],
        ${questions.map(q => q.field_type)}::community_application_question_field_types[],
        ${questions.map(q => (q.options ? JSON.stringify(q.options) : null))}::jsonb[],
        ${questions.map((_, i) => i)}::smallint[],
        ${questions.map(q => q.required ?? true)}::boolean[]
      ) AS t(question, field_type, options, order_index, required)
      `,
    options,
  )

  const result = await getApplicationQuestions(communityId, options)
  await query.commit()
  return result
}
