import { beginTransaction } from '@data-stores/psql'
import { observeSharedDbScope } from '@data-stores/psql/shared-db-scope-observer'
import { sharedDbIdsScope } from '@vouchington/postgres/query-telemetry'
import {
  retainedRelationReferences,
  RETAINED_USER_REFERENCES,
} from './retained-user-references.mts'
import { COMMUNITY_BRIDGE_FAMILY } from './retained-community-bridge-family.mts'
export const ROOT_FAMILIES = {
  community_bridge: COMMUNITY_BRIDGE_FAMILY,
  user: {
    table: 'retained_user_identities',
    references: RETAINED_USER_REFERENCES,
  },
  membership: {
    table: 'retained_membership_identities',
    references: [
      ['memberships', 'id'],
      ['membership_changes', 'membership_id'],
      ['membership_refunds', 'membership_id'],
      ['membership_administrator_refund_operation_requests', 'membership_id'],
    ],
  },
  api_key: {
    table: 'retained_api_key_identities',
    references: [
      ['api_keys', 'id'],
      ['mcp_call_audit_events', 'api_key_id'],
    ],
  },
  topic: {
    table: 'retained_topic_identities',
    references: [
      ['topics', 'id'],
      ['review_succession_topics', 'topic_id'],
      ...retainedRelationReferences('topic'),
    ],
  },
  post: {
    table: 'retained_post_identities',
    references: [
      ['posts', 'id'],
      ['notifications', 'publication_post_id'],
      ['post_admission_reservations', 'committed_post_id'],
      ['image_deletion_post_updates', 'post_id'],
      ['classifier_run_identities', 'post_id'],
      ['classifier_run_requests', 'post_id'],
      ...retainedRelationReferences('post'),
    ],
  },
  rss_feed_item: {
    table: 'retained_rss_feed_item_identities',
    references: [
      ['rss_feed_items', 'id'],
      ['notifications', 'publication_rss_feed_item_id'],
      ['classifier_run_identities', 'rss_feed_item_id'],
      ['classifier_run_requests', 'rss_feed_item_id'],
      ...retainedRelationReferences('rss_feed_item'),
    ],
  },
  image: {
    table: 'retained_image_identities',
    references: [
      ['images', 'id'],
      ['retained_image_placement_bindings', 'image_id'],
      ['copyright_notice_target_images', 'image_id'],
      ['copyright_staydown_entries', 'image_id'],
      ['copyright_staydown_matches', 'image_id'],
    ],
  },
} as const
export type RetainedIdentityFamily = keyof typeof ROOT_FAMILIES
export type RetainedIdentityCleanupPage = {
  family: RetainedIdentityFamily
  scanned: number
  deleted: number
  hasMore: boolean
}
/** One bounded keyset page per concrete family; this sweep does not determine referenced-row expiry. */
export async function cleanupRetainedIdentityRoots(
  pageSize = 1_000,
  idsByFamily?: Partial<Record<RetainedIdentityFamily, readonly string[]>>,
): Promise<RetainedIdentityCleanupPage[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000)
    throw new RangeError('Retained identity cleanup page size must be between 1 and 1000')
  const results: RetainedIdentityCleanupPage[] = []
  for (const family of Object.keys(ROOT_FAMILIES) as RetainedIdentityFamily[]) {
    const ids = idsByFamily?.[family]
    if (idsByFamily && !ids?.length) continue
    if (ids && ids.length > pageSize)
      throw new RangeError('Scoped retained identity cleanup must fit one page')
    observeSharedDbScope('cleanupRetainedIdentityRoots', sharedDbIdsScope(ids))
    // oxlint-disable-next-line no-await-in-loop -- each family has an independent bounded cursor transaction
    results.push(await cleanupRetainedIdentityFamily(family, pageSize, ids))
  }
  return results
}
async function cleanupRetainedIdentityFamily(
  family: RetainedIdentityFamily,
  pageSize: number,
  identityIds?: readonly string[],
): Promise<RetainedIdentityCleanupPage> {
  const { table, references } = ROOT_FAMILIES[family]
  await using query = await beginTransaction()
  if (!identityIds)
    await query(
      `/* ensureRetainedIdentityCleanupCursor */
        INSERT INTO retained_identity_cleanup_cursors (family) VALUES ($1) ON CONFLICT DO NOTHING`,
      [family],
    )
  const progress = identityIds
    ? null
    : (
        await query<{ cursor_identity_id: string | null }>(
          `/* lockRetainedIdentityCleanupProgress */
          SELECT cursor_identity_id FROM retained_identity_cleanup_cursors WHERE family = $1 FOR UPDATE`,
          [family],
        )
      ).rows[0]
  const { rows: candidates } = await query<{ id: string }>(
    `/* listRetainedIdentityCleanupCandidates */
    SELECT id FROM ${table}
    WHERE ($1::uuid[] IS NOT NULL AND id = ANY($1::uuid[]))
       OR ($1::uuid[] IS NULL AND ($2::uuid IS NULL OR id > $2::uuid))
    ORDER BY id LIMIT $3`,
    [identityIds ?? null, progress?.cursor_identity_id ?? null, pageSize + 1],
  )
  const page = candidates.slice(0, pageSize)
  const unreferenced = references
    .map(([owner, column]) => `NOT EXISTS (SELECT 1 FROM ${owner} WHERE ${column} = locked.id)`)
    .join(' AND ')
  const { rowCount } = await query(
    `/* deleteUnreferencedRetainedIdentityPage */
    WITH locked AS MATERIALIZED (
      SELECT root.id FROM ${table} root
      JOIN unnest($1::uuid[]) candidate(id) ON candidate.id = root.id
      ORDER BY root.id FOR UPDATE OF root SKIP LOCKED
    )
    DELETE FROM ${table} target USING locked
    WHERE target.id = locked.id AND ${unreferenced}`,
    [page.map(row => row.id)],
  )
  const hasMore = candidates.length > pageSize
  if (!identityIds)
    await query(
      `/* checkpointRetainedIdentityCleanup */
      UPDATE retained_identity_cleanup_cursors SET cursor_identity_id = $2 WHERE family = $1`,
      [family, hasMore ? page.at(-1)!.id : null],
    )
  await query.commit()
  return { family, scanned: page.length, deleted: rowCount ?? 0, hasMore }
}
