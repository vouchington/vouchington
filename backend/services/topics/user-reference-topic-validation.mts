import assert from 'http-assert'
import { read } from '@data-stores/psql'
import { validateUUID } from '@modules/utils'
import sql from 'sql-template-strings'

/** Validates an end-user topic reference before a write with REST entity-not-found semantics. */
export const assertUserReferenceTopicExists = async (
  id: string,
  expectedType: string,
  invalidMessage: string,
): Promise<void> => {
  validateUUID(id)
  const { rows } = await read(sql`/* assertUserReferenceTopicExists */
    SELECT
      id,
      deleted_at,
      merged_into_topic_id,
      CASE ${expectedType}
        -- no-mistakes-disable-next-line postgres-required-predicates: include inactive topics to preserve not-found and merge-conflict distinctions
        WHEN 'card' THEN EXISTS (SELECT 1 FROM card_topics WHERE topic_id = topics.id)
        WHEN 'rewards_program' THEN EXISTS (
          SELECT 1 FROM rewards_program_topics WHERE topic_id = topics.id
        )
        WHEN 'referral_program' THEN EXISTS (
          SELECT 1 FROM referral_program_topics WHERE topic_id = topics.id
        )
        WHEN 'rewards_program_status' THEN EXISTS (
          SELECT 1 FROM rewards_program_status_topics WHERE topic_id = topics.id
        )
        WHEN 'spending_category' THEN EXISTS (
          SELECT 1 FROM spending_category_topics WHERE topic_id = topics.id
        )
        ELSE false
      END AS type_matches
    -- no-mistakes-disable-next-line postgres-required-predicates: include inactive topics to distinguish deleted and merged reference outcomes
    FROM topics
    WHERE id = ${id}
    LIMIT 1
  `)
  const topic = rows[0] as
    | {
        deleted_at: Date | null
        merged_into_topic_id: string | null
        type_matches: boolean
      }
    | undefined
  assert(topic && topic.deleted_at === null, 404, 'Topic not found')
  assert(topic.merged_into_topic_id === null, 409, 'Topic has already been merged')
  assert(topic.type_matches, 422, invalidMessage)
}
