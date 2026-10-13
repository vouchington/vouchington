import { read } from '@data-stores/psql'
import sql from 'sql-template-strings'
import { normalizeKey } from '@ts-shared/utils/strings'
import { addEntityBloomKeys, type EntityBloomFilterType } from './bloom-filter-repair.mts'

export async function repairEntityBloomKeys(
  entityType: EntityBloomFilterType,
  id: string,
): Promise<void> {
  const query = entityKeysQuery(entityType, id)
  const { rows } = await read<{ id: string; lookup_key: string | null }>(query)
  const keys = rows.flatMap(row => [
    normalizeKey(row.id),
    ...(row.lookup_key ? [normalizeKey(row.lookup_key)] : []),
  ])
  if (keys.length > 0) await addEntityBloomKeys(entityType, keys)
}

function entityKeysQuery(entityType: EntityBloomFilterType, id: string) {
  switch (entityType) {
    case 'users':
      return sql`/* repairEntityBloomKeys */ SELECT id, username AS lookup_key FROM users WHERE id = ${id} AND deleted_at IS NULL`
    case 'topics':
      return sql`/* repairEntityBloomKeys */
        SELECT id, slug AS lookup_key FROM topics
        WHERE id = ${id} AND deleted_at IS NULL AND merged_into_topic_id IS NULL
        UNION ALL
        -- no-mistakes-disable-next-line postgres-required-predicates: retain merged source IDs for live destination redirect lookups, matching the full Bloom rebuild
        SELECT source.id, NULL::text FROM topics source
        JOIN topics destination ON destination.id = source.merged_into_topic_id
        WHERE source.id = ${id} AND source.deleted_at IS NULL AND source.merged_into_topic_id IS NOT NULL
          AND destination.deleted_at IS NULL AND destination.merged_into_topic_id IS NULL`
    case 'posts':
      return sql`/* repairEntityBloomKeys */
        SELECT post.id, slug.slug AS lookup_key FROM posts post
        LEFT JOIN post_slugs slug ON slug.post_id = post.id
        WHERE post.id = ${id} AND post.deleted_at IS NULL`
    case 'communities':
      return sql`/* repairEntityBloomKeys */ SELECT id, slug AS lookup_key FROM communities WHERE id = ${id} AND deleted_at IS NULL`
    case 'rss_feed_items':
      return sql`/* repairEntityBloomKeys */ SELECT id, NULL::text AS lookup_key FROM rss_feed_items WHERE id = ${id} AND deleted_at IS NULL`
  }
}

export async function repairPostSlugBloomKey(postId: string, slug: string): Promise<void> {
  const { rows } = await read(
    sql`/* repairPostSlugBloomKey */ SELECT slug FROM post_slugs WHERE post_id = ${postId} AND slug = ${slug}`,
  )
  if (rows.length > 0) await addEntityBloomKeys('posts', [normalizeKey(slug)])
}
