import { write } from '@data-stores/psql'
import type { ClaimedPostPublicationDirtyWork } from './types.mts'

const ROOT_HINT_KEY_BUDGET = 100

/**
 * A post, community, RSS, or story scope can inherit only a live post target or
 * retained impacted post. Author and alias scopes can seed any ancestor and
 * deliberately use the unrestricted walk. Too many retained impacts also fall
 * back to that exact walk; the hint is never an authority for membership.
 */
export async function readPublicationAncestorRootHints(
  work: ClaimedPostPublicationDirtyWork,
): Promise<Set<string> | null> {
  if (work.author_identity_id || work.topic_alias_identity_id) return null
  const { rows } = await write<{ impact_key_id: string | null; root_id: string | null }>(
    `/* readPublicationAncestorRootHints */
    WITH current_work AS MATERIALIZED (
      SELECT id, post_identity_id FROM post_publication_dirty_work
      WHERE id = $1::uuid AND generation = $3::bigint
    ), impact_keys AS MATERIALIZED (
      SELECT key.impact_post_identity_id
      FROM current_work work
      JOIN post_publication_dirty_work_keys key ON key.dirty_work_id = work.id
      WHERE key.impact_post_identity_id IS NOT NULL
      ORDER BY key.impact_post_identity_id
      LIMIT $2::integer + 1
    ), live_target AS (
      SELECT (
        SELECT COALESCE(post.root_post_id, post.id)
        FROM post_publication_post_identities identity
        JOIN posts post ON post.id = identity.post_id
        WHERE identity.id = work.post_identity_id
      ) AS root_id
      FROM current_work work
    )
    SELECT key.impact_post_identity_id AS impact_key_id,
      (SELECT COALESCE(post.root_post_id, post.id)
       FROM post_publication_post_identities identity
       JOIN posts post ON post.id = identity.post_id
       WHERE identity.id = key.impact_post_identity_id) AS root_id
    FROM impact_keys key
    UNION ALL
    SELECT NULL::uuid, target.root_id FROM live_target target`,
    [work.id, ROOT_HINT_KEY_BUDGET, work.generation],
  )
  // If the claimed generation changed between claim and this writer read, the
  // retained impact set cannot be used to exclude an ancestor root.
  if (rows.length === 0) return null
  if (rows.length > ROOT_HINT_KEY_BUDGET + 1) return null
  return new Set(rows.flatMap(row => (row.root_id ? [row.root_id] : [])))
}
