import type { TransactionQuery } from '@data-stores/psql'

export const PUBLICATION_IDENTITY_BRIDGES = {
  post: {
    table: 'post_publication_post_identities',
    liveTable: 'posts',
    liveColumn: 'post_id',
    keyColumn: 'impact_post_identity_id',
    workColumn: 'post_id',
  },
  community: {
    table: 'post_publication_community_identities',
    liveTable: 'communities',
    liveColumn: 'community_id',
    keyColumn: 'impact_community_identity_id',
    workColumn: 'community_id',
  },
  rss_feed_item: {
    table: 'post_publication_rss_feed_item_identities',
    liveTable: 'rss_feed_items',
    liveColumn: 'rss_feed_item_id',
    keyColumn: 'impact_rss_feed_item_identity_id',
    workColumn: null,
  },
  author: {
    table: 'post_publication_author_identities',
    liveTable: 'users',
    liveColumn: 'user_id',
    keyColumn: null,
    workColumn: 'author_user_id',
  },
  rss_feed: {
    table: 'post_publication_rss_feed_identities',
    liveTable: 'rss_feeds',
    liveColumn: 'rss_feed_id',
    keyColumn: null,
    workColumn: 'rss_feed_id',
  },
  topic_alias: {
    table: 'post_publication_topic_alias_identities',
    liveTable: 'topic_aliases',
    liveColumn: 'topic_alias_id',
    keyColumn: null,
    workColumn: 'topic_alias_id',
  },
  story: {
    table: 'post_publication_story_identities',
    liveTable: 'stories',
    liveColumn: 'story_id',
    keyColumn: null,
    workColumn: 'story_id',
  },
} as const
export type PublicationIdentityBridgeFamily = keyof typeof PUBLICATION_IDENTITY_BRIDGES

/** Shared ownership fences reclamation without serializing independent captures of the same identity. */
export async function retainPublicationIdentityBridges(
  query: TransactionQuery,
  family: PublicationIdentityBridgeFamily,
  ids: readonly string[],
): Promise<void> {
  if (!ids.length) return
  const { table, liveTable, liveColumn } = PUBLICATION_IDENTITY_BRIDGES[family]
  const ordered = [...new Set(ids.map(id => id.toLowerCase()))].sort()
  await query(
    `/* fencePublicationIdentityBridgeCapture */
    SELECT pg_advisory_xact_lock_shared(hashtextextended('publication-identity:' || $1 || ':' || input.id::text, 0))
    FROM unnest($2::uuid[]) input(id) ORDER BY input.id`,
    [family, ordered],
  )
  await insertOwnedIdentityBridges(query, table, liveTable, liveColumn, ordered)
}

/** Insertion and key-share acquisition are one operation behind the shared GC gap fence. */
async function insertOwnedIdentityBridges(
  query: TransactionQuery,
  table: string,
  liveTable: string,
  liveColumn: string,
  ordered: string[],
): Promise<void> {
  await query(
    `/* retainPublicationIdentityBridges */
    INSERT INTO ${table} (id, ${liveColumn})
    SELECT input.id, live.id FROM unnest($1::uuid[]) input(id)
    LEFT JOIN ${liveTable} live ON live.id = input.id ORDER BY input.id
    ON CONFLICT (id) DO NOTHING`,
    [ordered],
  )
  await query(
    `/* sharePublicationIdentityBridgeOwnership */
    SELECT id FROM ${table} WHERE id = ANY($1::uuid[]) ORDER BY id FOR KEY SHARE`,
    [ordered],
  )
}
