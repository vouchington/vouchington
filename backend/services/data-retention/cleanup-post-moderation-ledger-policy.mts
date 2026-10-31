import type { QueryExecutor } from '@data-stores/psql'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'

const ZERO_UUID = '00000000-0000-0000-0000-000000000000'

/** One bounded recheck when the code's policy revision changes. */
export async function reconsiderPostModerationPolicyRevision(
  query: QueryExecutor,
  batchSize: number,
  currentRevision = POST_MODERATION_POLICY_REVISION,
): Promise<{ hasMore: boolean; processed: boolean }> {
  await query(
    `/* ensurePostModerationPolicyRetentionCursor */
     INSERT INTO post_moderation_retention_cursors
       (kind, observed_policy_revision, policy_sweep_completed_at)
     VALUES ('superseded_versions', $1, CURRENT_TIMESTAMP)
     ON CONFLICT (kind) DO NOTHING`,
    [currentRevision],
  )
  const { rows } = await query<{
    observed_policy_revision: string | null
    cursor_policy_version_record_id: string | null
    policy_sweep_completed_at: Date | null
  }>(
    `/* lockPostModerationPolicyRetentionCursor */
     SELECT observed_policy_revision, cursor_policy_version_record_id,
       policy_sweep_completed_at
     FROM post_moderation_retention_cursors
     WHERE kind = 'superseded_versions' FOR UPDATE`,
  )
  const cursor = rows[0]
  if (!cursor) throw new Error('Missing post moderation policy retention cursor')
  if (cursor.observed_policy_revision === null) {
    await query(
      `/* initializePostModerationPolicyRetentionCursor */
       UPDATE post_moderation_retention_cursors
       SET observed_policy_revision = $1, policy_sweep_completed_at = CURRENT_TIMESTAMP
       WHERE kind = 'superseded_versions'`,
      [currentRevision],
    )
    return { hasMore: false, processed: false }
  }
  const changed = cursor.observed_policy_revision !== currentRevision
  if (!changed && cursor.policy_sweep_completed_at !== null)
    return { hasMore: false, processed: false }
  const afterId = changed ? ZERO_UUID : (cursor.cursor_policy_version_record_id ?? ZERO_UUID)
  const page = await reconsiderPostModerationPolicyRevisionPage(query, batchSize, afterId)
  await query(
    `/* checkpointPostModerationPolicyRetentionCursor */
     UPDATE post_moderation_retention_cursors
     SET observed_policy_revision = $1,
       cursor_policy_version_record_id = $2::uuid,
       policy_sweep_completed_at = CASE WHEN $3::boolean THEN NULL ELSE CURRENT_TIMESTAMP END,
       cursor_record_id = CASE WHEN $4::boolean THEN NULL ELSE cursor_record_id END,
       cursor_due_at = CASE WHEN $4::boolean THEN NULL ELSE cursor_due_at END,
       sweep_upper_bound_record_id = CASE
         WHEN $4::boolean THEN NULL ELSE sweep_upper_bound_record_id END,
       cursor_lower_bound_record_id = CASE
         WHEN $4::boolean THEN NULL ELSE cursor_lower_bound_record_id END
     WHERE kind = 'superseded_versions'`,
    [currentRevision, page.hasMore ? page.lastId : null, page.hasMore, page.processed],
  )
  return { hasMore: page.hasMore, processed: page.processed }
}

/** The same bounded revision page used by the durable dispatcher. */
export async function reconsiderPostModerationPolicyRevisionPage(
  query: QueryExecutor,
  batchSize: number,
  afterId: string,
): Promise<{ hasMore: boolean; processed: boolean; lastId: string | null }> {
  const { rows: versions } = await query<{ id: string; post_id: string }>(
    `/* listPostModerationPolicyRetentionVersions */
     SELECT id, post_id FROM post_moderation_versions
     WHERE retention_hash_blocked_at IS NOT NULL AND id > $1::uuid
     ORDER BY id LIMIT $2`,
    [afterId, batchSize + 1],
  )
  const page = versions.slice(0, batchSize)
  if (page.length > 0) {
    await query(
      `/* enqueuePostModerationPolicyRetentionRechecks */
       SELECT fn_create_post_moderation_retention_post_work_item(post_id)
       FROM unnest($1::uuid[]) AS input(post_id)`,
      [[...new Set(page.map(row => row.post_id))].toSorted()],
    )
  }
  const hasMore = versions.length > batchSize
  return { hasMore, processed: page.length > 0, lastId: page.at(-1)?.id ?? null }
}
