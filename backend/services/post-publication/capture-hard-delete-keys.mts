import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'
import type { TransactionQuery } from '@data-stores/psql'
import type { PublicationCapturedKey } from '@voucha/types/post-publication'

type HardDeletedKeyRow = {
  root_id: string
  kind: string
  uuid_value: string | null
  text_value: string | null
  post_type: string | null
  day: string | null
}

/** Reads every old identity before the caller's physical cascade, regardless of any receipt. */
export async function listHardDeletedPostPublicationKeys(
  query: TransactionQuery,
  rootPostIds: readonly string[],
): Promise<Array<{ rootId: string; key: PublicationCapturedKey }>> {
  const { rows } = await query<HardDeletedKeyRow>(
    `/* listHardDeletedPostPublicationKeys */
    WITH RECURSIVE roots AS (SELECT id FROM unnest($1::uuid[]) AS input(id)), parent_subtree AS (
      SELECT post.id, root.id AS root_id FROM roots root JOIN posts post ON post.id = root.id
      UNION ALL
      SELECT child.id, parent_subtree.root_id FROM parent_subtree
      -- no-mistakes-disable-next-line postgres-required-predicates: parent_post_id descendants span id partitions; see #3336
      JOIN posts child ON child.parent_post_id = parent_subtree.id
    ), subtree_ids AS (
      SELECT root_id, id FROM parent_subtree UNION
      SELECT root.id AS root_id, post.id FROM roots root
      -- no-mistakes-disable-next-line postgres-required-predicates: descendant rows span id partitions; see #3336
      JOIN posts post ON post.root_post_id = root.id
    ), subtree AS (
      SELECT subtree_ids.root_id, post.id, post.created_by_id, post.community_id,
        post.post_type, post.created_at, post.root_post_id
      FROM subtree_ids JOIN posts post ON post.id = subtree_ids.id
    ), publication_root AS (
      SELECT subtree.root_id, subtree.id AS post_id, post.community_id
      FROM subtree JOIN posts post ON post.id = COALESCE(subtree.root_post_id, subtree.id)
    )
    SELECT subtree.root_id, 'impact_post'::text AS kind, subtree.id AS uuid_value,
      NULL::text AS text_value, NULL::text AS post_type, NULL::text AS day FROM subtree
    UNION ALL SELECT subtree.root_id, 'impact_topic', rating.topic_id, NULL, NULL, NULL
      FROM subtree JOIN post_review_topic_ratings rating ON rating.post_id = subtree.id
    UNION ALL SELECT subtree.root_id, 'impact_topic', data_point.topic_id, NULL, NULL, NULL
      FROM subtree JOIN post_data_point_topics data_point ON data_point.post_id = subtree.id
    UNION ALL SELECT subtree.root_id, 'impact_topic', explicit.topic_id, NULL, NULL, NULL
      FROM subtree JOIN post_explicit_topic_categories explicit ON explicit.post_id = subtree.id
    UNION ALL SELECT subtree.root_id, 'impact_topic', recommendation.created_topic_id, NULL, NULL, NULL
      FROM subtree JOIN post_topic_recommendations recommendation ON recommendation.post_id = subtree.id
      WHERE recommendation.created_topic_id IS NOT NULL
    UNION ALL SELECT subtree.root_id, 'impact_topic', relation.object_id, NULL, NULL, NULL
      FROM subtree JOIN relation__post__category__topic relation ON relation.subject_id = subtree.id
      WHERE relation.deleted_at IS NULL
    UNION ALL SELECT subtree.root_id, 'impact_topic', relation.object_id, NULL, NULL, NULL
      FROM subtree JOIN relation__post__mentioned__topic relation ON relation.subject_id = subtree.id
      WHERE relation.deleted_at IS NULL
    UNION ALL SELECT subtree.root_id, 'impact_topic', alias.topic_id, NULL, NULL, NULL
      FROM subtree JOIN post_topic_alias_sources source ON source.post_id = subtree.id
      JOIN topic_aliases alias ON alias.id = source.topic_alias_id WHERE alias.topic_id IS NOT NULL
    UNION ALL SELECT subtree.root_id, 'identity_topic_alias', NULL, alias.alias, NULL, NULL
      FROM subtree JOIN post_topic_alias_sources source ON source.post_id = subtree.id
      JOIN topic_aliases alias ON alias.id = source.topic_alias_id
    UNION ALL SELECT subtree.root_id, 'impact_topic', alias.topic_id, NULL, NULL, NULL
      FROM subtree JOIN relation__post__category__topic_alias relation ON relation.subject_id = subtree.id
      JOIN topic_aliases alias ON alias.id = relation.object_id
      WHERE relation.deleted_at IS NULL AND relation.votes_score_net > 0 AND alias.topic_id IS NOT NULL
    UNION ALL SELECT subtree.root_id, 'identity_topic_alias', NULL, alias.alias, NULL, NULL
      FROM subtree JOIN relation__post__category__topic_alias relation ON relation.subject_id = subtree.id
      JOIN topic_aliases alias ON alias.id = relation.object_id
      WHERE relation.deleted_at IS NULL AND relation.votes_score_net > 0
    UNION ALL SELECT subtree.root_id, 'identity_author', subtree.created_by_id, NULL, NULL, NULL
      FROM subtree WHERE subtree.created_by_id IS NOT NULL
    UNION ALL SELECT subtree.root_id, 'identity_author_username', NULL, users.username, NULL, NULL
      FROM subtree JOIN users ON users.id = subtree.created_by_id WHERE users.username IS NOT NULL
    UNION ALL SELECT subtree.root_id, 'identity_community', subtree.community_id, NULL, NULL, NULL
      FROM subtree WHERE subtree.community_id IS NOT NULL
    UNION ALL SELECT publication_root.root_id, 'identity_community', publication_root.community_id, NULL, NULL, NULL
      FROM publication_root WHERE publication_root.community_id IS NOT NULL
    UNION ALL SELECT subtree.root_id, 'identity_community_slug', NULL, community.slug, NULL, NULL
      FROM subtree JOIN communities community ON community.id = subtree.community_id
    UNION ALL SELECT publication_root.root_id, 'identity_community_slug', NULL, community.slug, NULL, NULL
      FROM publication_root JOIN communities community ON community.id = publication_root.community_id
    UNION ALL SELECT subtree.root_id, 'identity_post_slug', NULL, slug.slug, NULL, NULL
      FROM subtree JOIN post_slugs slug ON slug.post_id = subtree.id
    UNION ALL SELECT publication_root.root_id, 'identity_rss_feed', source.rss_feed_id, NULL, NULL, NULL
      FROM publication_root JOIN story_posts story_post ON story_post.post_id = publication_root.post_id
      JOIN rss_feed_items item ON item.story_id = story_post.story_id AND item.deleted_at IS NULL
      JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
    UNION ALL SELECT subtree.root_id, 'sitemap_target', NULL, NULL, subtree.post_type::text,
      to_char(subtree.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD')
      FROM subtree WHERE subtree.post_type = ANY($2::post_types[])`,
    [rootPostIds, SITEMAP_CONFIG.POST_TYPES],
  )
  return rows.flatMap(row => {
    const key = toCapturedKey(row)
    return key ? [{ rootId: row.root_id, key }] : []
  })
}

function toCapturedKey(row: HardDeletedKeyRow): PublicationCapturedKey | undefined {
  if (row.kind === 'sitemap_target')
    return row.post_type && row.day
      ? { kind: 'sitemap_target', postType: row.post_type, day: row.day }
      : undefined
  if (row.uuid_value && isUuidKind(row.kind)) return { kind: row.kind, uuidValue: row.uuid_value }
  if (row.text_value && isTextKind(row.kind)) return { kind: row.kind, textValue: row.text_value }
  return undefined
}

function isUuidKind(
  kind: string,
): kind is Extract<PublicationCapturedKey, { uuidValue: string }>['kind'] {
  return [
    'impact_post',
    'impact_topic',
    'identity_author',
    'identity_community',
    'identity_rss_feed',
  ].includes(kind)
}

function isTextKind(
  kind: string,
): kind is Extract<PublicationCapturedKey, { textValue: string }>['kind'] {
  return [
    'identity_author_username',
    'identity_community_slug',
    'identity_post_slug',
    'identity_topic_alias',
  ].includes(kind)
}
