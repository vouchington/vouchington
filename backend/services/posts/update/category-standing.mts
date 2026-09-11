import { read } from '@data-stores/psql'
import type { QueryOptions } from '@data-stores/psql/types'

export async function getPostCategoryStandingCount(
  postId: string,
  options?: QueryOptions,
): Promise<number> {
  const { rows } = await read<{ count: number }>(
    `/* getPostCategoryStandingCount */
      SELECT COUNT(*)::integer AS count
      FROM (
        SELECT 'hashtag:' || aliases.alias AS category_key
        FROM post_topic_alias_sources source
        JOIN topic_aliases aliases ON aliases.id = source.topic_alias_id
        WHERE source.post_id = $1::uuid

        UNION

        SELECT 'topic:' || explicit.topic_id::text AS category_key
        FROM post_explicit_topic_categories explicit
        WHERE explicit.post_id = $1::uuid

        UNION

        SELECT 'topic:' || structured.topic_id::text AS category_key
        FROM post_data_point_topics structured
        WHERE structured.post_id = $1::uuid
      ) categories`,
    [postId],
    options,
  )
  return rows[0]!.count
}
