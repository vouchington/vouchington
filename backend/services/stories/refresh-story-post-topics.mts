import { read, write } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'
import sql from 'sql-template-strings'
import { getStoriesWorkLimit } from './work-limits.mts'

export async function readPriorStoryPostCategoryTopicIds(
  postId: string,
  options: QueryOptions,
): Promise<string[]> {
  const pageSize = getStoriesWorkLimit('crawl_effect_page_size')
  const priorTopicIds: string[] = []
  let afterTopicId: string | null = null
  while (true) {
    const cursorTopicId: string | null = afterTopicId
    // oxlint-disable-next-line no-await-in-loop -- keyset page advances sequentially through this story post's existing category topics
    const result: { rows: Array<{ object_id: string }> } = await read<{ object_id: string }>( // no-mistakes-disable-line query-reached-per-item: keyset pagination over one story post's category topics in DynamicConfig crawl_effect_page_size pages (hard max 1000)
      sql`/* refreshStoryPostForStory:priorTopics */
          SELECT object_id
          FROM relation__post__category__topic
          WHERE subject_id = ${postId}
            AND deleted_at IS NULL
            AND (${cursorTopicId}::uuid IS NULL OR object_id > ${cursorTopicId}::uuid)
          ORDER BY object_id ASC
          LIMIT ${pageSize}
        `,
      options,
    )
    for (const row of result.rows) {
      priorTopicIds.push(row.object_id)
    }
    if (result.rows.length < pageSize) break
    afterTopicId = result.rows.at(-1)!.object_id
  }
  return priorTopicIds
}

export async function pruneStoryPostCategoryTopics(
  postId: string,
  topicIds: readonly string[],
  deletedById: string,
  options: QueryOptions,
): Promise<void> {
  const pageSize = getStoriesWorkLimit('crawl_effect_page_size')
  while (true) {
    // oxlint-disable no-await-in-loop -- bounded batch UPDATE drains removed category topics for this story post
    // no-mistakes-disable-next-line query-reached-per-item: batched soft-delete of removed category topics in DynamicConfig crawl_effect_page_size pages (hard max 1000)
    const { rowCount } = await write(
      sql`/* refreshStoryPostForStory:pruneTopics */
        WITH target AS (
          SELECT subject_id, object_id
          FROM relation__post__category__topic
          WHERE subject_id = ${postId}
            AND deleted_at IS NULL
            AND (${topicIds.length} = 0 OR object_id != ALL(${topicIds}::uuid[]))
          ORDER BY subject_id, object_id
          LIMIT ${pageSize}
        )
        UPDATE relation__post__category__topic relation
        SET deleted_at = CURRENT_TIMESTAMP, deleted_by_id = ${deletedById}
        FROM target
        WHERE relation.subject_id = target.subject_id
          AND relation.object_id = target.object_id
      `,
      options,
    )
    // oxlint-enable no-await-in-loop
    if ((rowCount ?? 0) < pageSize) break
  }
}
