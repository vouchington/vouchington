export const RETAINED_KEY_COLUMNS = {
  impact_post: 'impact_post_identity_id',
  impact_community: 'impact_community_identity_id',
  impact_rss_feed_item: 'impact_rss_feed_item_identity_id',
  impact_topic: 'topic_key',
  identity_author: 'author_key',
  identity_community: 'community_key',
  identity_rss_feed: 'rss_feed_key',
  identity_author_username: 'author_username',
  identity_post_slug: 'post_slug',
  identity_community_slug: 'community_slug',
  identity_topic_alias: 'topic_alias',
  sitemap_target: 'post_type',
} as const
export const SNAPSHOT_KEY_COLUMNS = {
  topic: 'topic_key',
  author: 'author_key',
  author_username: 'author_username',
  community: 'community_key',
  community_slug: 'community_slug',
  post_slug: 'post_slug',
  rss_feed: 'rss_feed_key',
  sitemap_target: 'post_type',
} as const

export function retainedKeyPayloadSql(alias: 'key' | 'retained' = 'key'): string {
  return payloadSql(
    RETAINED_KEY_COLUMNS,
    alias,
    [
      'impact_post_identity_id',
      'impact_community_identity_id',
      'impact_rss_feed_item_identity_id',
      'topic_key',
      'author_key',
      'community_key',
      'rss_feed_key',
    ],
    ['author_username', 'post_slug', 'community_slug', 'topic_alias'],
  )
}
export function snapshotKeyPayloadSql(): string {
  return payloadSql(
    SNAPSHOT_KEY_COLUMNS,
    'key',
    ['topic_key', 'author_key', 'community_key', 'rss_feed_key'],
    ['author_username', 'community_slug', 'post_slug'],
  )
}
function payloadSql(
  columns: Record<string, string>,
  alias: string,
  uuidColumns: string[],
  textColumns: string[],
): string {
  return `CASE ${Object.entries(columns)
    .map(([kind, column]) => `WHEN ${alias}.${column} IS NOT NULL THEN '${kind}'`)
    .join(' ')} END AS kind,
    COALESCE(${uuidColumns.map(column => `${alias}.${column}`).join(', ')}) AS uuid_value,
    COALESCE(${textColumns.map(column => `${alias}.${column}`).join(', ')}) AS text_value,
    ${alias}.post_type, ${alias}.day`
}
