import { beginTransaction } from '@data-stores/psql'
import { observeSharedDbScope, sharedDbIdsScope } from '@data-stores/psql/shared-db-scope-observer'
import { electedRelationMetadata } from '@services/users/relation-impact-targets'

function retainedRelationReferences(subjectType: string): [string, string][] {
  return electedRelationMetadata.flatMap(metadata =>
    metadata.subject_type === subjectType
      ? [[`retained_${metadata.table_name}`, 'subject_id']]
      : [],
  )
}

export const ROOT_FAMILIES = {
  user: {
    table: 'retained_user_identities',
    references: [
      ['users', 'id'],
      ['images', 'created_by_id'],
      ['image_surface_placement_activations', 'bound_by_id'],
      ['image_surface_placement_activations', 'uploaded_by_id'],
      ['user_deletion_requests', 'user_id'],
      ['user_deletion_requests', 'requested_by_id'],
      ['post_publication_author_identities', 'id'],
      ['membership_changes', 'user_id'],
      ['membership_changes', 'changed_by_id'],
      ['membership_grants', 'granted_by_id'],
      ['membership_grants', 'revoked_by_id'],
      ['membership_refunds', 'user_id'],
      ['membership_refunds', 'issued_by_id'],
      ['membership_administrator_refund_operation_requests', 'issued_by_id'],
      ['membership_sources', 'user_id'],
      ['oauth_authorization_server_events', 'user_id'],
      ['post_moderation_dispositions', 'actor_user_id'],
      ['post_clearance_changes', 'changed_by_id'],
      ['community_post_review_changes', 'changed_by_id'],
      ['copyright_notice_lifecycle_changes', 'changed_by_id'],
      ['fediverse_instance_integration_changes', 'changed_by_id'],
      ['media_delivery_registry_changes', 'changed_by_id'],
      ['moderation_appeal_lifecycle_changes', 'changed_by_id'],
      ['moderation_appeals', 'original_decided_by_id'],
      ['review_dispute_lifecycle_changes', 'changed_by_id'],
      ['rss_feed_setting_changes', 'changed_by_id'],
      ['mcp_call_audit_events', 'actor_user_id'],
      ['user_legal_preservation_holds', 'account_user_id'],
      ['user_legal_preservation_holds', 'placed_by_id'],
      ['user_legal_preservation_holds', 'released_by_id'],
      ['copyright_notice_targets', 'surface_owner_user_id'],
      ['copyright_territorial_notice_receipts', 'requester_user_id'],
      ['copyright_territorial_redress_requests', 'submitted_by_id'],
      ['copyright_trusted_flaggers', 'created_by_id'],
      ['copyright_trusted_flagger_changes', 'changed_by_id'],
      ...retainedRelationReferences('user'),
    ],
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
      ['post_publication_post_identities', 'id'],
      ['notifications', 'publication_post_id'],
      ['post_admission_reservations', 'committed_post_id'],
      ...retainedRelationReferences('post'),
    ],
  },
  rss_feed_item: {
    table: 'retained_rss_feed_item_identities',
    references: [
      ['rss_feed_items', 'id'],
      ['post_publication_rss_feed_item_identities', 'id'],
      ['notifications', 'publication_rss_feed_item_id'],
      ...retainedRelationReferences('rss_feed_item'),
    ],
  },
  image: {
    table: 'retained_image_identities',
    references: [
      ['images', 'id'],
      ['retained_image_placement_bindings', 'image_id'],
      ['copyright_notice_target_images', 'image_id'],
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

/** One bounded keyset page per concrete family; no retained audit record has an expiry. */
export async function cleanupRetainedIdentityRoots(
  pageSize = 1_000,
  idsByFamily?: Partial<Record<RetainedIdentityFamily, readonly string[]>>,
): Promise<RetainedIdentityCleanupPage[]> {
  if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 1_000) {
    throw new RangeError('Retained identity cleanup page size must be between 1 and 1000')
  }
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
  const progress = identityIds
    ? null
    : (
        await query<{ cursor_identity_id: string | null }>(
          `/* lockRetainedIdentityCleanupProgress */
          SELECT cursor_identity_id FROM retained_identity_cleanup_progress WHERE family = $1 FOR UPDATE`,
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
      UPDATE retained_identity_cleanup_progress
      SET cursor_identity_id = $2 WHERE family = $1`,
      [family, hasMore ? page.at(-1)!.id : null],
    )
  await query.commit()
  return { family, scanned: page.length, deleted: rowCount ?? 0, hasMore }
}
