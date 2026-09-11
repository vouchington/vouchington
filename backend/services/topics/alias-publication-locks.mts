import type { TransactionQuery } from '@data-stores/psql/types'
import { lockTopicAliasPublicationScopes } from '@services/post-publication'

type TopicMergeAliasPublicationScopes = {
  lockedAliasIds: ReadonlySet<string>
  sourceAliasIds: ReadonlySet<string>
}

/** Locks existing alias publication scopes discovered by their stable alias strings. */
export async function lockExistingTopicAliasPublicationScopes(
  query: TransactionQuery,
  aliases: readonly string[],
): Promise<ReadonlyMap<string, string>> {
  if (aliases.length === 0) return new Map()
  const { rows } = await query<{ id: string; alias: string }>(
    `/* lockExistingTopicAliasPublicationScopes */
    SELECT id, alias
    FROM topic_aliases
    WHERE alias = ANY($1::text[])
    ORDER BY id`,
    [aliases],
  )
  await lockTopicAliasPublicationScopes(
    query,
    rows.map(row => row.id),
  )
  return new Map(rows.map(row => [row.alias, row.id]))
}

/**
 * Locks source and RSS feed-category alias scopes in one UUID order before topic merge row locks.
 * Returning only source aliases preserves the merge's optimistic source-alias recheck.
 */
export async function lockTopicMergeAliasPublicationScopes(
  query: TransactionQuery,
  sourceTopicId: string,
  sourceTopicSlug: string,
): Promise<TopicMergeAliasPublicationScopes> {
  const rows = await getTopicMergeAliasPublicationScopeRows(query, sourceTopicId, sourceTopicSlug)
  await lockTopicAliasPublicationScopes(
    query,
    rows.map(row => row.id),
  )
  const sourceAliasIds = new Set<string>()
  for (const row of rows) {
    if (row.is_source_alias) sourceAliasIds.add(row.id)
  }
  return { lockedAliasIds: new Set(rows.map(row => row.id)), sourceAliasIds }
}

async function getTopicMergeAliasPublicationScopeRows(
  query: TransactionQuery,
  sourceTopicId: string,
  sourceTopicSlug: string,
): Promise<Array<{ id: string; is_source_alias: boolean }>> {
  const { rows } = await query<{ id: string; is_source_alias: boolean }>(
    `/* lockTopicMergeAliasPublicationScopes */
    WITH merge_aliases AS (
      SELECT id, TRUE AS is_source_alias
      FROM topic_aliases
      WHERE topic_id = $1::uuid OR alias = $2

      UNION ALL

      SELECT category.topic_alias_id AS id, FALSE AS is_source_alias
      FROM rss_feed_item_categories category
      WHERE category.topic_alias_id IS NOT NULL
        AND EXISTS (
          SELECT 1
          FROM rss_feed_item_sources source
          JOIN rss_feeds feed ON feed.id = source.rss_feed_id
          WHERE source.rss_feed_item_id = category.rss_feed_item_id
            AND feed.topic_id = $1::uuid
            AND feed.deleted_at IS NULL
        )
    )
    SELECT id, BOOL_OR(is_source_alias) AS is_source_alias
    FROM merge_aliases
    GROUP BY id
    ORDER BY id`,
    [sourceTopicId, sourceTopicSlug],
  )
  return rows
}
