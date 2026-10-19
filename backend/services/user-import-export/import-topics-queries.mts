import { createSlugFromTitle } from '@modules/utils'
import { read, write, type QueryExecutor } from '@data-stores/psql'
import { getTopicsByReferenceBatch } from '@services/topics/resolve-references'
import sql from 'sql-template-strings'

export type PreparedTopicInput = {
  index: number
  rawName: string
  name: string
  slug: string
  error?: string
}

export type TopicImportAudit = {
  index: number
  inputValue: string
  topicId?: string
  recommendationPostId?: string
}

export function prepareTopicInput(rawName: string, index: number): PreparedTopicInput {
  const name = rawName.trim()
  if (!name) {
    return { index, rawName, name, slug: '', error: 'Topic name is empty' }
  }

  const slug = createSlugFromTitle(name)
  if (!slug) {
    return { index, rawName, name, slug, error: 'Could not derive a valid slug from name' }
  }
  return { index, rawName, name, slug }
}

/** Topic import uses the shared reference resolver, including merges and aliases. */
export async function findTopicsBySlugOrName(
  inputs: PreparedTopicInput[],
): Promise<Map<number, string>> {
  if (inputs.length === 0) return new Map()
  const topics = await getTopicsByReferenceBatch(inputs.map(input => input.name))
  return new Map(
    inputs.flatMap((input, index) => {
      const topic = topics[index]
      return topic ? [[input.index, topic.id] as const] : []
    }),
  )
}

export async function getFollowedTopicIds(
  userId: string,
  topicIds: string[],
  query: QueryExecutor = read,
): Promise<Set<string>> {
  if (topicIds.length === 0) return new Set()
  const { rows } = await query<{ object_id: string }>(
    sql`/* isUserFollowingTopic */
      SELECT object_id
      FROM relation__user__follow__topic
      WHERE subject_id = ${userId}
        AND object_id = ANY(${topicIds}::uuid[])
        AND deleted_at IS NULL
    `,
  )
  return new Set(rows.map(row => row.object_id))
}

export async function recordTopicImportRequests(
  userId: string,
  audits: TopicImportAudit[],
  query: QueryExecutor = write,
): Promise<void> {
  if (audits.length === 0) return
  await query(
    sql`/* recordTopicImportRequest */
      INSERT INTO user_import_requests (
        user_id,
        entity_type,
        topic_id,
        topic_recommendation_post_id,
        followed_at,
        input_value
      )
      SELECT
        ${userId}::uuid AS user_id,
        'topic',
        input.topic_id,
        input.recommendation_post_id,
        CASE WHEN input.topic_id IS NOT NULL THEN CURRENT_TIMESTAMP END,
        input.input_value
      FROM unnest(
        ${audits.map(audit => audit.topicId ?? null)}::uuid[],
        ${audits.map(audit => audit.recommendationPostId ?? null)}::uuid[],
        ${audits.map(audit => audit.inputValue)}::text[]
      ) AS input(topic_id, recommendation_post_id, input_value)
      ORDER BY user_id ASC NULLS LAST, input.recommendation_post_id ASC NULLS LAST
      ON CONFLICT (user_id, topic_recommendation_post_id)
        WHERE topic_recommendation_post_id IS NOT NULL
      DO NOTHING
    `,
  )
}
