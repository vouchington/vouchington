import { write } from '@data-stores/psql'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'

/**
 * Persists exact current cache identities under the active generation so one post's fan-out drains
 * through the ordinary retained-key cursor instead of expanding one worker effect page.
 */
export async function retainCurrentPublicationIdentityKeys(
  work: ClaimedPostPublicationDirtyWork,
  postIds: readonly string[],
): Promise<boolean> {
  if (postIds.length === 0) return true
  const { rows } = await write<{ has_lease: boolean }>(
    `/* retainCurrentPublicationIdentityKeys */
    WITH lease AS (
      SELECT id FROM post_publication_dirty_work
      WHERE id = $1 AND generation = $2 AND lease_token = $3 AND lease_expires_at > CURRENT_TIMESTAMP
    ), selected AS (
      SELECT UNNEST($4::uuid[]) AS post_id
    ), keys AS (
      SELECT selected.post_id, 'identity_author'::text AS kind, candidate.created_by_id AS uuid_value,
        NULL::text AS text_value FROM selected JOIN posts candidate ON candidate.id = selected.post_id
        WHERE candidate.created_by_id IS NOT NULL
      UNION ALL
      SELECT selected.post_id, 'identity_author_username', NULL, author.username
      FROM selected JOIN posts candidate ON candidate.id = selected.post_id
      JOIN users author ON author.id = candidate.created_by_id WHERE author.username IS NOT NULL
      UNION ALL
      SELECT selected.post_id, 'identity_community', candidate.community_id, NULL
      FROM selected JOIN posts candidate ON candidate.id = selected.post_id
      WHERE candidate.community_id IS NOT NULL
      UNION ALL
      SELECT selected.post_id, 'identity_community', root.community_id, NULL
      FROM selected JOIN posts candidate ON candidate.id = selected.post_id
      JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
      WHERE root.community_id IS NOT NULL
      UNION ALL
      SELECT selected.post_id, 'identity_community_slug', NULL, community.slug
      FROM selected JOIN posts candidate ON candidate.id = selected.post_id
      JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
      JOIN communities community ON community.id IN (candidate.community_id, root.community_id)
      WHERE community.slug IS NOT NULL
      UNION ALL
      SELECT selected.post_id, 'identity_post_slug', NULL, post_slug.slug
      FROM selected JOIN post_slugs post_slug ON post_slug.post_id = selected.post_id
      UNION ALL
      SELECT selected.post_id, 'identity_rss_feed', source.rss_feed_id, NULL
      FROM selected JOIN posts candidate ON candidate.id = selected.post_id
      JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
      JOIN post__stories post_story ON post_story.post_id = root.id
      JOIN rss_feed_items item ON item.story_id = post_story.story_id AND item.deleted_at IS NULL
      JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id
    ), uuid_keys AS (
      SELECT lease.id AS dirty_work_id, keys.kind, keys.uuid_value
      FROM lease CROSS JOIN keys
      WHERE keys.uuid_value IS NOT NULL
    ), text_keys AS (
      SELECT lease.id AS dirty_work_id, keys.kind, keys.text_value
      FROM lease CROSS JOIN keys
      WHERE keys.text_value IS NOT NULL
    ), uuid_inserted AS (
      INSERT INTO post_publication_dirty_work_keys (dirty_work_id, kind, uuid_value, text_value)
      SELECT dirty_work_id, kind, uuid_value, NULL::text FROM uuid_keys
      ORDER BY dirty_work_id, kind, uuid_value
      ON CONFLICT (dirty_work_id, kind, uuid_value) WHERE uuid_value IS NOT NULL DO NOTHING
      RETURNING 1
    ), uuid_gate AS (
      SELECT COUNT(*) FROM uuid_inserted
    ), text_inserted AS (
      INSERT INTO post_publication_dirty_work_keys (dirty_work_id, kind, uuid_value, text_value)
      SELECT dirty_work_id, kind, NULL::uuid, text_value FROM text_keys CROSS JOIN uuid_gate
      ORDER BY dirty_work_id, kind, text_value
      ON CONFLICT (dirty_work_id, kind, text_value) WHERE text_value IS NOT NULL DO NOTHING
      RETURNING 1
    )
    SELECT EXISTS (SELECT 1 FROM lease) AS has_lease`,
    [work.id, work.generation, work.lease_token, postIds],
  )
  return rows[0]?.has_lease ?? false
}
