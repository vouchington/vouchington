import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { TransactionQuery } from '@data-stores/psql'
import { RETAINED_KEY_COLUMNS } from './concrete-key-columns.mts'
import { retainPublicationIdentityBridges } from './identity-bridges.mts'
import {
  retainedKeyConflictValuesSql,
  type PostPublicationRetainedKey,
} from './retained-key-writes.mts'

type HardDeletedKeyRow = {
  root_id: string
  kind: string
  uuid_value: string | null
  text_value: string | null
  post_type: string | null
  day: string | null
}

export type HardDeletedPublicationKey = {
  rootId: string
  key: PostPublicationRetainedKey
}

/** One post-lock read of subtree impact keys and identity keys for posts with no receipt. */
export async function listHardDeletedPostPublicationKeys(
  query: TransactionQuery,
  rootPostIds: readonly string[],
): Promise<HardDeletedPublicationKey[]> {
  const { rows } = await query<HardDeletedKeyRow>(
    `/* listHardDeletedPostPublicationKeys */
    WITH roots AS (
      SELECT id FROM unnest($1::uuid[]) AS input(id)
    ), subtree AS (
      SELECT post.id, root.id AS root_id, post.created_by_id, post.community_id, post.post_type,
        post.created_at, post.root_post_id
      FROM roots root
      JOIN posts post ON post.id = root.id
      UNION ALL
      SELECT post.id, root.id, post.created_by_id, post.community_id, post.post_type, post.created_at,
        post.root_post_id
      FROM roots root
      -- no-mistakes-disable-next-line postgres-required-predicates: descendant rows are keyed by root_post_id across id partitions; see #3336
      JOIN posts post ON post.root_post_id = root.id
    ), unreceived AS (
      SELECT subtree.* FROM subtree
      WHERE NOT EXISTS (
        SELECT 1 FROM post_publication_projection_receipts receipt
        WHERE receipt.post_identity_id = subtree.id
      )
    ), publication_root AS (
      SELECT unreceived.root_id, unreceived.id AS post_id, post.community_id
      -- no-mistakes-disable-next-line postgres-required-predicates: the publication root follows root_post_id across id partitions; see #3336
      FROM unreceived
      JOIN posts post ON post.id = COALESCE(unreceived.root_post_id, unreceived.id)
    )
    SELECT subtree.root_id, 'impact_post'::text AS kind, subtree.id AS uuid_value, NULL::text AS text_value,
      NULL::text AS post_type, NULL::text AS day
    FROM subtree
    UNION ALL
    SELECT unreceived.root_id, 'topic', rating.topic_id, NULL, NULL, NULL
    FROM unreceived
    JOIN post_review_topic_ratings rating ON rating.post_id = unreceived.id
    UNION ALL
    SELECT unreceived.root_id, 'topic', data_point.topic_id, NULL, NULL, NULL
    FROM unreceived
    JOIN post_data_point_topics data_point ON data_point.post_id = unreceived.id
    UNION ALL
    SELECT unreceived.root_id, 'topic', relation.object_id, NULL, NULL, NULL
    FROM unreceived
    JOIN relation__post__category__topic relation ON relation.subject_id = unreceived.id
    WHERE relation.deleted_at IS NULL
    UNION ALL
    SELECT unreceived.root_id, 'topic', alias.topic_id, NULL, NULL, NULL
    FROM unreceived
    JOIN post_topic_alias_sources source ON source.post_id = unreceived.id
    JOIN topic_aliases alias ON alias.id = source.topic_alias_id
    WHERE alias.topic_id IS NOT NULL
    UNION ALL
    SELECT unreceived.root_id, 'topic', alias.topic_id, NULL, NULL, NULL
    FROM unreceived
    JOIN relation__post__category__topic_alias relation ON relation.subject_id = unreceived.id
    JOIN topic_aliases alias ON alias.id = relation.object_id
    WHERE relation.deleted_at IS NULL AND relation.votes_score_net > 0 AND alias.topic_id IS NOT NULL
    UNION ALL
    SELECT unreceived.root_id, 'author', unreceived.created_by_id, NULL, NULL, NULL
    FROM unreceived WHERE unreceived.created_by_id IS NOT NULL
    UNION ALL
    SELECT unreceived.root_id, 'author_username', NULL, users.username, NULL, NULL
    FROM unreceived JOIN users ON users.id = unreceived.created_by_id
    WHERE users.username IS NOT NULL
    UNION ALL
    SELECT unreceived.root_id, 'community', unreceived.community_id, NULL, NULL, NULL
    FROM unreceived WHERE unreceived.community_id IS NOT NULL
    UNION ALL
    SELECT publication_root.root_id, 'community', publication_root.community_id, NULL, NULL, NULL
    FROM publication_root WHERE publication_root.community_id IS NOT NULL
    UNION ALL
    SELECT unreceived.root_id, 'community_slug', NULL, community.slug, NULL, NULL
    FROM unreceived
    JOIN communities community ON community.id = unreceived.community_id
    WHERE community.slug IS NOT NULL
    UNION ALL
    SELECT publication_root.root_id, 'community_slug', NULL, community.slug, NULL, NULL
    FROM publication_root
    JOIN communities community ON community.id = publication_root.community_id
    WHERE community.slug IS NOT NULL
    UNION ALL
    SELECT unreceived.root_id, 'post_slug', NULL, post_slug.slug, NULL, NULL
    FROM unreceived JOIN post_slugs post_slug ON post_slug.post_id = unreceived.id
    UNION ALL
    SELECT publication_root.root_id, 'rss_feed', source.rss_feed_id, NULL, NULL, NULL
    FROM publication_root
    JOIN story_posts story_post ON story_post.post_id = publication_root.post_id
    JOIN rss_feed_items item ON item.story_id = story_post.story_id AND item.deleted_at IS NULL
    JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
    UNION ALL
    SELECT unreceived.root_id, 'sitemap_target', NULL, NULL, unreceived.post_type::text,
      to_char(unreceived.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
    FROM unreceived
    WHERE unreceived.post_type = ANY($2::post_types[])`,
    [rootPostIds, SITEMAP_CONFIG.POST_TYPES],
  )
  return rows.flatMap(row => {
    const key = toHardDeletedRetainedKey(row)
    return key ? [{ rootId: row.root_id, key }] : []
  })
}

export async function retainHardDeletedPostPublicationKeys(
  query: TransactionQuery,
  entries: readonly { dirtyWorkId: string; key: PostPublicationRetainedKey }[],
): Promise<void> {
  const unique = dedupeHardDeletedKeys(entries)
  if (unique.length === 0) return
  await retainPublicationIdentityBridges(
    query,
    'post',
    unique.flatMap(entry => (entry.key.kind === 'impact_post' ? [entry.key.uuidValue] : [])),
  )
  const columns = [...Object.values(RETAINED_KEY_COLUMNS), 'day']
  await query(
    `/* retainHardDeletedPostPublicationKeys */
    INSERT INTO post_publication_dirty_work_keys (dirty_work_id, ${columns.join(', ')})
    SELECT key.dirty_work_id, ${retainedKeyConflictValuesSql}
    FROM UNNEST($1::uuid[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[])
      AS key(dirty_work_id, kind, uuid_value, text_value, post_type, day)
    ORDER BY key.dirty_work_id, ${retainedKeyConflictValuesSql}
    ON CONFLICT (dirty_work_id, ${columns.join(', ')}) DO NOTHING`,
    [
      unique.map(entry => entry.dirtyWorkId),
      unique.map(entry => entry.key.kind),
      unique.map(entry => ('uuidValue' in entry.key ? entry.key.uuidValue : null)),
      unique.map(entry => ('textValue' in entry.key ? entry.key.textValue : null)),
      unique.map(entry => ('postType' in entry.key ? entry.key.postType : null)),
      unique.map(entry => ('day' in entry.key ? entry.key.day : null)),
    ],
  )
}
const UUID_KINDS = {
  impact_post: 'impact_post',
  topic: 'impact_topic',
  author: 'identity_author',
  community: 'identity_community',
  rss_feed: 'identity_rss_feed',
} as const
const TEXT_KINDS = {
  author_username: 'identity_author_username',
  community_slug: 'identity_community_slug',
  post_slug: 'identity_post_slug',
} as const

function toHardDeletedRetainedKey(row: HardDeletedKeyRow): PostPublicationRetainedKey | undefined {
  if (row.kind === 'sitemap_target') {
    return row.post_type && row.day
      ? { kind: 'sitemap_target', postType: row.post_type, day: row.day }
      : undefined
  }
  const uuidKind = UUID_KINDS[row.kind as keyof typeof UUID_KINDS]
  if (uuidKind) return row.uuid_value ? { kind: uuidKind, uuidValue: row.uuid_value } : undefined
  const textKind = TEXT_KINDS[row.kind as keyof typeof TEXT_KINDS]
  return textKind && row.text_value ? { kind: textKind, textValue: row.text_value } : undefined
}

function dedupeHardDeletedKeys(
  entries: readonly { dirtyWorkId: string; key: PostPublicationRetainedKey }[],
): Array<{ dirtyWorkId: string; key: PostPublicationRetainedKey }> {
  const seen = new Set<string>()
  return entries.filter(entry => {
    const identity =
      'uuidValue' in entry.key
        ? entry.key.uuidValue
        : 'textValue' in entry.key
          ? entry.key.textValue
          : `${entry.key.postType}:${entry.key.day}`
    const signature = `${entry.dirtyWorkId}:${entry.key.kind}:${identity}`
    if (seen.has(signature)) return false
    seen.add(signature)
    return true
  })
}
