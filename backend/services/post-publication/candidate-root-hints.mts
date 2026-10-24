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

/**
 * The first post-scope raw page may start at its oldest retained seed ID. Posts and
 * descendants have strictly increasing UUIDs by the canonical parent/root
 * constraints. An impact-community key can seed older, unrelated roots, so
 * that scope keeps the global scan. Unknown or oversized seed sets do too.
 */
export async function readPublicationPostScanFloor(
  work: ClaimedPostPublicationDirtyWork,
): Promise<string | null> {
  if (!work.post_identity_id || work.cursor_post_id || work.pending_post_identity_id) return null
  const { rows: scope } = await write<{
    post_id: string | null
    has_community_impact: boolean
  }>(
    `/* readPublicationPostScanFloorScope */
    SELECT target.post_id,
      EXISTS (
        SELECT 1 FROM post_publication_dirty_work_keys key
        WHERE key.dirty_work_id = current_work.id
          AND key.impact_post_identity_id IS NULL
          AND key.impact_community_identity_id IS NOT NULL
      ) AS has_community_impact
    FROM post_publication_dirty_work current_work
    JOIN post_publication_post_identities target ON target.id = current_work.post_identity_id
    WHERE current_work.id = $1::uuid AND current_work.generation = $2::bigint`,
    [work.id, work.generation],
  )
  const target = scope[0]
  if (!target?.post_id || target.has_community_impact) return null

  const { rows: impacts } = await write<{
    impact_post_identity_id: string | null
  }>(
    `/* readPublicationPostScanFloorImpacts */
    SELECT impact.impact_post_identity_id
    FROM post_publication_dirty_work current_work
    LEFT JOIN LATERAL (
      SELECT key.impact_post_identity_id
      FROM post_publication_dirty_work_keys key
      WHERE key.dirty_work_id = current_work.id
        AND key.impact_post_identity_id IS NOT NULL
      ORDER BY key.impact_post_identity_id LIMIT $3::integer + 1
    ) impact ON TRUE
    WHERE current_work.id = $1::uuid AND current_work.generation = $2::bigint`,
    [work.id, work.generation, ROOT_HINT_KEY_BUDGET],
  )
  if (impacts.length === 0 || impacts.length > ROOT_HINT_KEY_BUDGET) return null
  // Retained identity IDs equal the original post UUID even after deletion.
  // Including deleted seeds lowers the floor conservatively and preserves
  // historical impact order without authorizing the deleted post.
  return [
    target.post_id,
    ...impacts.flatMap(impact =>
      impact.impact_post_identity_id ? [impact.impact_post_identity_id] : [],
    ),
  ].toSorted()[0]!
}
