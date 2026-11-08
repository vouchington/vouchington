import type { TransactionQuery } from '@data-stores/psql/types'
import type { TopicAliasUnlinkPage } from '@queues/rss-feed-maintenance/types'
import type {
  PostSourceRow,
  RelationRow,
  StagedTopicAliasUnlinkPage,
} from './unlink-topic-alias-stage.mts'
import { clearRssItemCategories } from './unlink-topic-alias-category-phase.mts'

export type AliasUnlinkRow = {
  id: string
  alias: string
  unlink_topic_id: string
}

export async function getPendingAlias(
  query: TransactionQuery,
  topicAliasId: string,
): Promise<AliasUnlinkRow | null> {
  const { rows } = await query<AliasUnlinkRow & { unlink_requested_at: Date | null }>(
    `/* getPendingAlias */
    SELECT id, alias, unlink_topic_id, unlink_requested_at
    FROM topic_aliases
    WHERE id = $1::uuid`,
    [topicAliasId],
  )
  const alias = rows[0]
  if (!alias?.unlink_requested_at || !alias.unlink_topic_id) return null
  return alias
}

export async function finalizeTopicAliasUnlink(
  query: TransactionQuery,
  alias: AliasUnlinkRow,
  preservesHashtag: boolean,
): Promise<boolean> {
  // Ordered scalar probes keep every child check on its alias index in generic plans.
  if (preservesHashtag) {
    const { rows } = await query<{ id: string }>(
      `/* finalizeTopicAliasUnlink preserveHashtag */
      UPDATE topic_aliases
      SET unlink_requested_at = NULL, unlink_topic_id = NULL
      WHERE id = $1::uuid
        AND unlink_requested_at IS NOT NULL
        AND (SELECT subject_id FROM relation__post__category__topic_alias
          WHERE object_id = $1::uuid ORDER BY subject_id LIMIT 1) IS NULL
        AND (SELECT rss_feed_item_id FROM rss_feed_item_categories
          WHERE topic_alias_id = $1::uuid
          ORDER BY rss_feed_item_id DESC, category_identity_id DESC LIMIT 1) IS NULL
        AND (SELECT subject_id FROM relation__rss_feed_item__category__topic_alias
          WHERE object_id = $1::uuid ORDER BY subject_id LIMIT 1) IS NULL
      RETURNING id`,
      [alias.id],
    )
    return rows.length > 0
  }
  const { rows } = await query<{ id: string }>(
    `/* finalizeTopicAliasUnlink deleteOrdinaryAlias */
    DELETE FROM topic_aliases
    WHERE id = $1::uuid
      AND unlink_requested_at IS NOT NULL
      AND (SELECT post_id FROM post_topic_alias_sources
        WHERE topic_alias_id = $1::uuid ORDER BY post_id DESC, id DESC LIMIT 1) IS NULL
      AND (SELECT subject_id FROM relation__post__category__topic_alias
        WHERE object_id = $1::uuid ORDER BY subject_id LIMIT 1) IS NULL
      AND (SELECT rss_feed_item_id FROM rss_feed_item_categories
        WHERE topic_alias_id = $1::uuid
        ORDER BY rss_feed_item_id DESC, category_identity_id DESC LIMIT 1) IS NULL
      AND (SELECT subject_id FROM relation__rss_feed_item__category__topic_alias
        WHERE object_id = $1::uuid ORDER BY subject_id LIMIT 1) IS NULL
    RETURNING id`,
    [alias.id],
  )
  return rows.length > 0
}

export async function deleteTopicAliasUnlinkPhase(
  query: TransactionQuery,
  alias: AliasUnlinkRow,
  page: TopicAliasUnlinkPage,
  staged: StagedTopicAliasUnlinkPage,
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  if (page.phase !== staged.phase) return { postIds: [], rssFeedItemIds: [] }
  if (staged.phase === 'post_sources')
    return deletePostSources(query, alias.id, page.pageCursor, staged.rows)
  if (staged.phase === 'post_relations')
    return deletePostRelations(query, alias.id, page.pageCursor, staged.rows)
  if (staged.phase === 'rss_item_categories')
    return clearRssItemCategories(query, alias.id, page.pageCursor, staged.rows)
  if (staged.phase === 'rss_item_relations')
    return deleteRssItemRelations(query, alias.id, page.pageCursor, staged.rows)
  return { postIds: [], rssFeedItemIds: [] }
}

async function deletePostSources(
  query: TransactionQuery,
  topicAliasId: string,
  pageCursor: string,
  rows: readonly PostSourceRow[],
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  if (rows[0]?.id !== pageCursor) return { postIds: [], rssFeedItemIds: [] }
  const { rows: deleted } = await query<{ post_id: string }>(
    `/* deletePostSources remove */
    DELETE FROM post_topic_alias_sources AS source
    USING unnest($2::uuid[]) AS locked(id)
    WHERE source.topic_alias_id = $1::uuid
      AND source.id = locked.id
      AND source.id = ANY($2::uuid[])
      AND EXISTS (SELECT 1 FROM topic_aliases alias
        WHERE alias.id = $1::uuid AND alias.unlink_requested_at IS NOT NULL)
    RETURNING source.post_id`,
    [topicAliasId, rows.map(row => row.id)],
  )
  return { postIds: deleted.map(row => row.post_id), rssFeedItemIds: [] }
}

async function deletePostRelations(
  query: TransactionQuery,
  topicAliasId: string,
  pageCursor: string,
  rows: readonly RelationRow[],
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  if (rows[0]?.id !== pageCursor) return { postIds: [], rssFeedItemIds: [] }
  const { rows: deleted } = await query<{ subject_id: string }>(
    `/* deletePostRelations remove */
    DELETE FROM relation__post__category__topic_alias AS relation
    USING unnest($2::uuid[], $3::uuid[]) AS locked(subject_id, id)
    WHERE relation.object_id = $1::uuid
      AND relation.subject_id = locked.subject_id
      AND relation.id = locked.id
      AND relation.subject_id = ANY($2::uuid[])
      AND relation.id = ANY($3::uuid[])
      AND EXISTS (SELECT 1 FROM topic_aliases alias
        WHERE alias.id = $1::uuid AND alias.unlink_requested_at IS NOT NULL)
    RETURNING relation.subject_id`,
    [topicAliasId, rows.map(row => row.subject_id), rows.map(row => row.id)],
  )
  return { postIds: deleted.map(row => row.subject_id), rssFeedItemIds: [] }
}

async function deleteRssItemRelations(
  query: TransactionQuery,
  topicAliasId: string,
  pageCursor: string,
  rows: readonly RelationRow[],
): Promise<{ postIds: string[]; rssFeedItemIds: string[] }> {
  if (rows[0]?.id !== pageCursor) return { postIds: [], rssFeedItemIds: [] }
  const { rows: deleted } = await query<{ subject_id: string }>(
    `/* deleteRssItemRelations remove */
    DELETE FROM relation__rss_feed_item__category__topic_alias AS relation
    USING unnest($2::uuid[], $3::uuid[]) AS locked(subject_id, id)
    WHERE relation.object_id = $1::uuid
      AND relation.subject_id = locked.subject_id
      AND relation.id = locked.id
      AND relation.subject_id = ANY($2::uuid[])
      AND relation.id = ANY($3::uuid[])
      AND EXISTS (SELECT 1 FROM topic_aliases alias
        WHERE alias.id = $1::uuid AND alias.unlink_requested_at IS NOT NULL)
    RETURNING relation.subject_id`,
    [topicAliasId, rows.map(row => row.subject_id), rows.map(row => row.id)],
  )
  return { postIds: [], rssFeedItemIds: deleted.map(row => row.subject_id) }
}
