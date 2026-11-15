import { read, beginTransaction, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import assert from 'http-assert'
import { getCommunityWithViewer } from '../load-with-viewer.mts'
import type { CommunityApplicationQuestion } from '../types.mts'
import {
  assertApplicationQuestionInputs,
  type ApplicationQuestionInput,
} from './question-input.mts'
import { COMMUNITY_APPLICATION_LIMIT_MAX_VALUES } from './question-limits.mts'

// The partial unique index on (community_id, order_index) for live rows plus the order_index
// CHECK (0 to 999) keep a community at or below this many live questions.
const QUESTION_ROWS_MAX = COMMUNITY_APPLICATION_LIMIT_MAX_VALUES.questions_per_community

export type { ApplicationQuestionInput }

export async function getApplicationQuestions(
  communityId: string,
  options?: QueryOptions & { lock?: boolean },
): Promise<CommunityApplicationQuestion[]> {
  const statement = sql`/* getApplicationQuestions */
    SELECT id, community_id, question, field_type, options, order_index, is_required, created_at, deleted_at
    FROM community_application_questions
    WHERE community_id = ${communityId}
      AND deleted_at IS NULL
    ORDER BY order_index ASC
    LIMIT ${QUESTION_ROWS_MAX}`
  if (options?.lock) statement.append(sql` FOR SHARE`)

  const { rows } = await read(statement, options)
  return rows as CommunityApplicationQuestion[]
}

export async function setApplicationQuestions(
  currentUserId: string,
  communityId: string,
  questions: ApplicationQuestionInput[],
): Promise<CommunityApplicationQuestion[]> {
  const loaded = await getCommunityWithViewer(communityId, currentUserId)
  assert(loaded, 404, 'Community not found')
  const { community, membership } = loaded
  assert(!community.archived_at, 403, 'Community is archived')
  assert(membership?.role === 'owner', 403, 'Only owners can set application questions')
  assertApplicationQuestionInputs(questions)

  await using query = await beginTransaction()

  const options = { query }

  if (questions.length === 0) {
    await write(
      sql`/* setApplicationQuestions:clear */
      UPDATE community_application_questions
      SET deleted_at = CURRENT_TIMESTAMP
      WHERE community_id = ${communityId}
        AND deleted_at IS NULL
      `,
      options,
    )
    await query.commit()
    return []
  }
  // One statement replaces the form. The insert reads the soft-delete's row count through `gate`,
  // so the old rows are retired before the first new one is checked against the unique order index.
  const { rows } = await write(
    sql`/* setApplicationQuestions */
      WITH retired AS (
        UPDATE community_application_questions
        SET deleted_at = CURRENT_TIMESTAMP
        WHERE community_id = ${communityId}
          AND deleted_at IS NULL
        RETURNING id
      ), gate AS MATERIALIZED (
        SELECT COUNT(*) AS retired_count FROM retired
      )
      INSERT INTO community_application_questions (
        community_id, question, field_type, options, order_index, is_required
      )
      SELECT ${communityId}, t.question, t.field_type, t.options::jsonb, t.order_index, t.is_required
      FROM UNNEST(
        ${questions.map(q => q.question)}::text[],
        ${questions.map(q => q.field_type)}::community_application_question_field_types[],
        ${questions.map(q => (q.options ? JSON.stringify(q.options) : null))}::jsonb[],
        ${questions.map((_, i) => i)}::smallint[],
        ${questions.map(q => q.is_required ?? true)}::boolean[]
      ) AS t(question, field_type, options, order_index, is_required)
      CROSS JOIN gate
      RETURNING id, community_id, question, field_type, options, order_index, is_required,
        created_at, deleted_at
      `,
    options,
  )
  await query.commit()
  return (rows as CommunityApplicationQuestion[]).toSorted((a, b) => a.order_index - b.order_index)
}
