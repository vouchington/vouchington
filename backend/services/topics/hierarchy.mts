import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import { getTopicsByAnyBatch } from './get-batch.mts'
import type { Topic } from './types.mts'
import { getEntityRelationTableNameOrThrow } from '@services/entity-relations/metadata'

const TOPIC_PARENT_RELATION_TABLE = getEntityRelationTableNameOrThrow({
  subjectType: 'topic',
  predicate: 'parent',
  objectType: 'topic',
})

export const TOPIC_PARENT_IDS_QUERY = `/* getTopicParentIds */
    SELECT object_id
    FROM ${TOPIC_PARENT_RELATION_TABLE}
    WHERE subject_id = $1
      AND deleted_at IS NULL
    ORDER BY created_at ASC
    `

export const TOPIC_CHILD_IDS_QUERY = `/* getTopicChildIds */
    SELECT subject_id
    FROM ${TOPIC_PARENT_RELATION_TABLE}
    WHERE object_id = $1
      AND deleted_at IS NULL
    ORDER BY created_at ASC
    `

async function getTopicParentIds(topicId: string, options: QueryOptions = {}): Promise<string[]> {
  const { rows } = await read(TOPIC_PARENT_IDS_QUERY, [topicId], options)

  return rows.map(row => row.object_id as string)
}

async function getTopicChildIds(topicId: string, options: QueryOptions = {}): Promise<string[]> {
  const { rows } = await read(TOPIC_CHILD_IDS_QUERY, [topicId], options)

  return rows.map(row => row.subject_id as string)
}

export async function getTopicParents(
  topicId: string,
  options: QueryOptions = {},
): Promise<Topic[]> {
  const ids = await getTopicParentIds(topicId, options)
  if (ids.length === 0) return []
  const topics = await getTopicsByAnyBatch(ids, options)
  return topics.filter((topic): topic is Topic => topic != null)
}

export async function getTopicChildren(
  topicId: string,
  options: QueryOptions = {},
): Promise<Topic[]> {
  const ids = await getTopicChildIds(topicId, options)
  if (ids.length === 0) return []
  const topics = await getTopicsByAnyBatch(ids, options)
  return topics.filter((topic): topic is Topic => topic != null)
}
