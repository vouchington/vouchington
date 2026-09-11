import type { TransactionQuery } from '@data-stores/psql/types'
import { SITEMAP_CONFIG } from '@voucha/config/sitemaps'

export type PostPublicationPostScopeContext = {
  dirtyWorkId: string
  postId: string
}

/** Retains current public identities and sitemap targets for one bounded set of post scopes. */
export async function retainPostPublicationPostScopeContext(
  query: TransactionQuery,
  scopes: readonly PostPublicationPostScopeContext[],
): Promise<void> {
  if (scopes.length === 0) return
  await query(
    `/* retainPostPublicationPostScopeContext */
    WITH dirty AS (
      SELECT dirty_work_id, post_id
      FROM UNNEST($1::uuid[], $2::uuid[]) AS input(dirty_work_id, post_id)
    ), keys AS (
      SELECT dirty.dirty_work_id, 'identity_author'::text AS kind,
        post.created_by_id AS uuid_value, NULL::text AS text_value,
        NULL::post_types AS post_type, NULL::date AS day
      FROM dirty JOIN posts post ON post.id = dirty.post_id
      WHERE post.created_by_id IS NOT NULL
      UNION ALL
      SELECT dirty.dirty_work_id, 'identity_community', post.community_id, NULL, NULL, NULL
      FROM dirty JOIN posts post ON post.id = dirty.post_id
      WHERE post.community_id IS NOT NULL
      UNION ALL
      SELECT dirty.dirty_work_id, 'identity_community_slug', NULL, community.slug, NULL, NULL
      FROM dirty JOIN posts post ON post.id = dirty.post_id
      JOIN communities community ON community.id = post.community_id
      WHERE community.slug IS NOT NULL
      UNION ALL
      SELECT dirty.dirty_work_id, 'identity_post_slug', NULL, post_slug.slug, NULL, NULL
      FROM dirty JOIN post_slugs post_slug ON post_slug.post_id = dirty.post_id
      UNION ALL
      SELECT dirty.dirty_work_id, 'sitemap_target', NULL, NULL, candidate.post_type,
        (candidate.created_at AT TIME ZONE 'UTC')::date
      FROM dirty JOIN posts candidate ON candidate.id = dirty.post_id
      WHERE candidate.post_type = ANY($3::post_types[])
      UNION ALL
      SELECT dirty.dirty_work_id, 'sitemap_target', NULL, NULL, candidate.post_type,
        (candidate.created_at AT TIME ZONE 'UTC')::date
      FROM dirty JOIN posts candidate ON candidate.root_id = dirty.post_id
      WHERE candidate.post_type = ANY($3::post_types[])
    ), uuid_keys AS (
      SELECT dirty_work_id, kind, uuid_value
      FROM keys WHERE uuid_value IS NOT NULL
    ), text_keys AS (
      SELECT dirty_work_id, kind, text_value
      FROM keys WHERE text_value IS NOT NULL
    ), sitemap_keys AS (
      SELECT dirty_work_id, kind, post_type, day
      FROM keys WHERE post_type IS NOT NULL
    ), uuid_inserted AS (
    INSERT INTO post_publication_dirty_work_keys
      (dirty_work_id, kind, uuid_value)
    SELECT dirty_work_id, kind, uuid_value FROM uuid_keys
    ORDER BY dirty_work_id, kind, uuid_value
    ON CONFLICT (dirty_work_id, kind, uuid_value) WHERE uuid_value IS NOT NULL DO NOTHING
    RETURNING 1
    ), uuid_gate AS (
      SELECT COUNT(*) FROM uuid_inserted
    ), text_inserted AS (
    INSERT INTO post_publication_dirty_work_keys
      (dirty_work_id, kind, text_value)
    SELECT dirty_work_id, kind, text_value FROM text_keys CROSS JOIN uuid_gate
    ORDER BY dirty_work_id, kind, text_value
    ON CONFLICT (dirty_work_id, kind, text_value) WHERE text_value IS NOT NULL DO NOTHING
    RETURNING 1
    ), text_gate AS (
      SELECT COUNT(*) FROM text_inserted
    ), sitemap_inserted AS (
    INSERT INTO post_publication_dirty_work_keys
      (dirty_work_id, kind, uuid_value, text_value, post_type, day)
    SELECT dirty_work_id, kind, NULL::uuid, NULL::text, post_type, day
    FROM sitemap_keys CROSS JOIN text_gate
    ORDER BY dirty_work_id, kind, post_type, day
    ON CONFLICT (dirty_work_id, kind, post_type, day) WHERE post_type IS NOT NULL DO NOTHING
    ) SELECT 1`,
    [
      scopes.map(scope => scope.dirtyWorkId),
      scopes.map(scope => scope.postId),
      SITEMAP_CONFIG.POST_TYPES,
    ],
  )
}
