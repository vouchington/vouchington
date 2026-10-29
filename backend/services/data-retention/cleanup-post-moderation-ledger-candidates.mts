import type { QueryExecutor } from '@data-stores/psql'
import { POST_MODERATION_POLICY_REVISION } from '@services/post-clearance/moderation-ledger-types'
import type { PostModerationRetentionKind } from '@voucha/types/entities/moderation-retention'

export type PostModerationCandidate = { id: string; version_id: string; retention_due_at: Date }
type Owner = { id: string; post_id: string; is_current: boolean }

export async function processPostModerationCandidatePage(
  query: QueryExecutor,
  kind: PostModerationRetentionKind,
  page: PostModerationCandidate[],
  upperId: string,
  revision = POST_MODERATION_POLICY_REVISION,
): Promise<{ changed: number; needsRetry: boolean }> {
  if (page.length === 0) return { changed: 0, needsRetry: false }
  const { rows: owners } = await query<Owner>(
    `/* loadPostModerationRetentionCandidateOwners */
     SELECT version.id, version.post_id,
       (version.content_sha256 = post.llm_moderation_content_sha256
        AND version.policy_revision = $2) IS TRUE AS is_current
     FROM post_moderation_versions version JOIN posts post ON post.id = version.post_id
     WHERE version.id = ANY($1::uuid[])`,
    [[...new Set(page.map(row => row.version_id))], revision],
  )
  const ownerByVersion = new Map(owners.map(owner => [owner.id, owner]))
  const expectedCurrent = kind === 'pass_evidence'
  const kept = page.filter(row => {
    const owner = ownerByVersion.get(row.version_id)
    return owner && owner.is_current !== expectedCurrent
  })
  // A mixed page has two incompatible lock phases. Block its keepers without parent
  // locks, then retry the still-due actionable rows on the next bounded page.
  if (kept.length > 0) {
    await blockPostModerationCandidates(query, kind, kept, ownerByVersion, revision)
    return { changed: 0, needsRetry: true }
  }
  const actionable = page.filter(row => {
    const owner = ownerByVersion.get(row.version_id)
    return owner && owner.is_current === expectedCurrent
  })
  const postIds = [
    ...new Set(actionable.map(row => ownerByVersion.get(row.version_id)!.post_id)),
  ].toSorted()
  if (postIds.length === 0) return { changed: 0, needsRetry: false }
  const { rows: lockedPosts } = await query<{ id: string }>(
    `/* cleanupPostModerationLedgerPage.lockPagePosts */
     SELECT id FROM posts WHERE id = ANY($1::uuid[]) ORDER BY id FOR UPDATE`,
    [postIds],
  )
  const lockedPostIds = lockedPosts.map(row => row.id)
  if (lockedPostIds.length === 0) return { changed: 0, needsRetry: false }
  const ids = actionable.map(row => row.id)
  const result =
    kind === 'superseded_versions'
      ? await query(
          `/* cleanupPostModerationLedgerPage.deleteVersions */
           DELETE FROM post_moderation_versions version USING posts post
           WHERE version.id = ANY($1::uuid[]) AND post.id = version.post_id
             AND post.id = ANY($4::uuid[])
             AND (version.content_sha256 <> post.llm_moderation_content_sha256
                  OR version.policy_revision <> $2)
             AND EXISTS (
               SELECT 1 FROM post_moderation_versions successor
               WHERE successor.post_id = version.post_id
                 AND successor.id > version.id AND successor.id < $3::uuid
             )`,
          [ids, revision, upperId, lockedPostIds],
        )
      : await query(
          `/* cleanupPostModerationLedgerPage.clearPassEvidence */
           UPDATE post_moderation_dispositions disposition
           SET evidence = '{}'::jsonb, retention_due_at = NULL
           FROM post_moderation_versions version, posts post
           WHERE disposition.id = ANY($1::uuid[])
             AND version.id = disposition.version_id AND post.id = version.post_id
             AND post.id = ANY($3::uuid[])
             AND version.content_sha256 = post.llm_moderation_content_sha256
             AND version.policy_revision = $2
             AND disposition.disposition = 'pass' AND disposition.source <> 'staff'
             AND disposition.evidence <> '{}'::jsonb`,
          [ids, revision, lockedPostIds],
        )
  // The digest can change between the unlocked filter and the post lock. The guarded
  // mutation then skips that row; block it now while the post lock closes the race.
  const { rows: newlyKept } = await query<{ id: string; version_id: string }>(
    kind === 'superseded_versions'
      ? `/* listLockedPostModerationVersionKeepers */
         SELECT version.id, version.id AS version_id
         FROM post_moderation_versions version JOIN posts post ON post.id = version.post_id
         WHERE version.id = ANY($1::uuid[]) AND post.id = ANY($2::uuid[])
           AND version.retention_due_at IS NOT NULL
           AND (version.content_sha256 = post.llm_moderation_content_sha256
                AND version.policy_revision = $3) IS TRUE`
      : `/* listLockedPostModerationPassKeepers */
         SELECT disposition.id, disposition.version_id
         FROM post_moderation_dispositions disposition
         JOIN post_moderation_versions version ON version.id = disposition.version_id
         JOIN posts post ON post.id = version.post_id
         WHERE disposition.id = ANY($1::uuid[]) AND post.id = ANY($2::uuid[])
           AND disposition.retention_due_at IS NOT NULL
           AND (version.content_sha256 = post.llm_moderation_content_sha256
                AND version.policy_revision = $3) IS NOT TRUE`,
    [ids, lockedPostIds, revision],
  )
  await blockPostModerationCandidates(query, kind, newlyKept, ownerByVersion, revision)
  return { changed: result.rowCount ?? 0, needsRetry: false }
}

async function blockPostModerationCandidates(
  query: QueryExecutor,
  kind: PostModerationRetentionKind,
  rows: Array<{ id: string; version_id: string }>,
  ownerByVersion: Map<string, Owner>,
  revision: string,
): Promise<void> {
  if (rows.length === 0) return
  const postIds = [
    ...new Set(rows.map(row => ownerByVersion.get(row.version_id)!.post_id)),
  ].toSorted()
  // Work comes before source-row locks. The worker takes the same work→source order;
  // the queued recheck also closes a hash-write race after the unlocked filter.
  await query(
    `/* enqueuePostModerationRetentionRecheck */
     SELECT fn_create_post_moderation_retention_post_work_item(post_id)
     FROM unnest($1::uuid[]) AS input(post_id)`,
    [postIds],
  )
  const versionIds = [...new Set(rows.map(row => row.version_id))]
  if (kind === 'superseded_versions') {
    await query(
      `/* blockPostModerationRetentionVersions */
       UPDATE post_moderation_versions version
       SET retention_due_at = NULL,
           retention_hash_blocked_at = COALESCE(retention_hash_blocked_at, CURRENT_TIMESTAMP)
       FROM posts post
       WHERE version.id = ANY($1::uuid[]) AND post.id = version.post_id
         AND version.retention_due_at IS NOT NULL
         AND (version.content_sha256 = post.llm_moderation_content_sha256
              AND version.policy_revision = $2) IS TRUE`,
      [versionIds, revision],
    )
    return
  }
  await query(
    `/* markPostModerationRetentionPassHostBlocked */
     UPDATE post_moderation_versions
     SET retention_hash_blocked_at = COALESCE(retention_hash_blocked_at, CURRENT_TIMESTAMP)
     WHERE id = ANY($1::uuid[])`,
    [versionIds],
  )
  await query(
    `/* blockPostModerationRetentionPassEvidence */
     UPDATE post_moderation_dispositions disposition
     SET retention_due_at = NULL
     FROM post_moderation_versions version, posts post
     WHERE disposition.id = ANY($1::uuid[]) AND version.id = disposition.version_id
       AND post.id = version.post_id AND disposition.retention_due_at IS NOT NULL
       AND (version.content_sha256 = post.llm_moderation_content_sha256
            AND version.policy_revision = $2) IS NOT TRUE`,
    [rows.map(row => row.id), revision],
  )
}
