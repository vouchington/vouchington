import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import {
  createPaginationParser,
  decodeScopedUuidCursor,
  encodeScopedUuidCursor,
} from '@modules/pagination'
import { getEntityRelationTableNameOrThrow } from '@services/entity-relations/metadata'
import type { PageInfo } from '@voucha/types/pagination'
import sql from 'sql-template-strings'
import { getTopicsByAnyBatch } from './get-batch.mts'
import type { Topic } from './types.mts'

const TOPIC_PARENT_RELATION_TABLE = getEntityRelationTableNameOrThrow({
  subjectType: 'topic',
  predicate: 'parent',
  objectType: 'topic',
})

/** The `after` cursor and `limit` of a page of child topics. The limit is clamped to 1-100. */
export const topicChildrenPaginationParser = createPaginationParser({
  cursor: { type: 'simple' },
  limit: { min: 1, max: 100, default: 25 },
})

export type TopicChildrenPage = { results: Topic[]; page_info: PageInfo }

/**
 * One bounded page of the topics that have `topicId` as a parent. The cursor is scoped to the
 * parent topic, so a cursor from another topic's children is refused instead of silently skipping
 * rows. `after` and `limit` are the parsed values of `topicChildrenPaginationParser`.
 */
export async function getTopicChildrenPage(
  topicId: string,
  pagination: { after?: string | undefined; limit: number },
  options: QueryOptions = {},
): Promise<TopicChildrenPage> {
  const scope = `topic-children:${topicId}:id-asc`
  const afterId = pagination.after
    ? decodeScopedUuidCursor(pagination.after, scope, 'Invalid cursor format').id
    : null
  const query = sql`/* getTopicChildIdPage */
    SELECT subject_id FROM `.append(TOPIC_PARENT_RELATION_TABLE).append(sql`
    WHERE object_id = ${topicId} AND deleted_at IS NULL
  `)
  // Keep the seek predicate independent so a generic plan can use it as an index condition.
  if (afterId) query.append(sql` AND subject_id > ${afterId}`)
  query.append(sql` ORDER BY subject_id ASC LIMIT ${pagination.limit + 1}`)
  const { rows } = await read<{ subject_id: string }>(query, undefined, options)
  const hasNextPage = rows.length > pagination.limit
  const childIds = rows.slice(0, pagination.limit).map(row => row.subject_id)
  const topics = childIds.length > 0 ? await getTopicsByAnyBatch(childIds, options) : []

  return {
    results: topics.filter((topic): topic is Topic => topic != null),
    page_info: {
      has_next_page: hasNextPage,
      start_cursor: childIds[0] ? encodeScopedUuidCursor(childIds[0], scope) : null,
      end_cursor:
        hasNextPage && childIds.length > 0 ? encodeScopedUuidCursor(childIds.at(-1)!, scope) : null,
    },
  }
}
