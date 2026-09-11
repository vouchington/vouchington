import { read, beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunity } from '../get.mts'
import { getCommunityMember } from '../members/get.mts'
import type { CommunityApplicationQuestion } from '../types.mts'

const VALID_FIELD_TYPES = [
  'short_text',
  'long_text',
  'single_select',
  'multi_select',
  'checkbox',
] as const
type FieldType = (typeof VALID_FIELD_TYPES)[number]
const VALID_FIELD_TYPES_SET: ReadonlySet<string> = new Set(VALID_FIELD_TYPES)

export type ApplicationQuestionInput = {
  question: string
  field_type: FieldType
  options?: string[] | null
  required?: boolean
}

export async function getApplicationQuestions(
  communityId: string,
  options?: QueryOptions,
): Promise<CommunityApplicationQuestion[]> {
  const { rows } = await read(
    sql`/* getApplicationQuestions */
    SELECT *
    FROM community_application_questions
    WHERE community_id = ${communityId}
      AND deleted_at IS NULL
    ORDER BY order_index ASC
    `,
    options,
  )
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

  for (const q of questions) {
    assert(
      q.question && q.question.trim() === q.question,
      422,
      'Question must not have leading or trailing whitespace',
    )
    assert(
      q.question.length >= 1 && q.question.length <= 500,
      422,
      'Question must be between 1 and 500 characters',
    )
    assert(VALID_FIELD_TYPES_SET.has(q.field_type), 422, `Invalid field_type: ${q.field_type}`)

    const requiresOptions = q.field_type === 'single_select' || q.field_type === 'multi_select'
    if (requiresOptions) {
      assert(
        Array.isArray(q.options) && q.options.length > 0,
        422,
        'select field types require options',
      )
    }
  }

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
  const { rows } = await write(
    sql`/* setApplicationQuestions */
      INSERT INTO community_application_questions (community_id, question, field_type, options, order_index, required)
      SELECT ${communityId}, question, field_type, options::jsonb, order_index, required
      FROM UNNEST(
        ${questions.map(q => q.question)}::text[],
        ${questions.map(q => q.field_type)}::community_application_question_field_types[],
        ${questions.map(q => (q.options ? JSON.stringify(q.options) : null))}::jsonb[],
        ${questions.map((_, i) => i)}::smallint[],
        ${questions.map(q => q.required ?? true)}::boolean[]
      ) AS t(question, field_type, options, order_index, required)
      RETURNING *
      `,
    options,
  )

  await query.commit()
  return rows as CommunityApplicationQuestion[]
}
