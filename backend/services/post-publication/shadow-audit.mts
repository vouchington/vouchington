import { beginTransaction, write, type TransactionQuery } from '@data-stores/psql'
import { recordPostPublicationChange } from './capture.mts'
import sql from 'sql-template-strings'
import { publicationEligibilityFingerprintSql } from './fingerprint.mts'
import {
  publicationProjectionIdentitySql,
  type PublicationProjectionIdentity,
} from './projection-identity.mts'
import { retainAppliedProjectionIdentity } from './shadow-repair.mts'
import {
  isPostPublicationTypedProtocolActive,
  markPostPublicationTypedProtocol,
} from './identity-protocol.mts'
import { publicationSnapshotMismatchSql } from './identity-source.mts'
import {
  makeShadowAuditResult,
  type PostPublicationShadowAuditResult,
} from './shadow-audit-result.mts'
export type { PostPublicationShadowAuditResult } from './shadow-audit-result.mts'
import { recordPostPublicationShadowRepair } from './record-shadow-repair.mts'
const SHADOW_AUDIT_CHECKPOINT = 'post-publication-shadow'
export const POST_PUBLICATION_SHADOW_AUDIT_PAGE_SIZE = 100
export type ShadowAuditCandidate = {
  id: string
  has_author: boolean
  has_community: boolean
  has_rss_source: boolean
  is_discrepant: boolean
  applied_identity: PublicationProjectionIdentity | null
  current_identity: PublicationProjectionIdentity
  typed: boolean
}
/** Bounded operator audit: dry runs are read-only; repairs record post transitions before advancing the checkpoint. */
export async function runPostPublicationShadowAudit(options: {
  dryRun: boolean
  limit?: number
  checkpointName?: string
  /** Read-only streaming cursor. Dry runs never read or mutate the durable checkpoint. */
  cursor?: string | null
}): Promise<PostPublicationShadowAuditResult> {
  const limit = options.limit ?? POST_PUBLICATION_SHADOW_AUDIT_PAGE_SIZE
  if (!Number.isSafeInteger(limit) || limit < 1)
    throw new TypeError('Post publication shadow audit limit must be positive')
  const checkpointName = options.checkpointName ?? SHADOW_AUDIT_CHECKPOINT
  if (options.dryRun) return inspectPostPublicationShadowAudit(limit, options.cursor ?? null)
  await using query = await beginTransaction()
  await markPostPublicationTypedProtocol(query)
  const result = await repairPostPublicationShadowAudit(query, limit, checkpointName)
  await query.commit()
  return result
}
async function inspectPostPublicationShadowAudit(
  limit: number,
  cursor: string | null,
): Promise<PostPublicationShadowAuditResult> {
  const candidates = await listShadowAuditCandidates(undefined, cursor, limit)
  return makeShadowAuditResult(true, candidates, limit)
}

async function repairPostPublicationShadowAudit(
  query: TransactionQuery,
  limit: number,
  checkpointName: string,
): Promise<PostPublicationShadowAuditResult> {
  // ast-grep-ignore: no-three-sequential-awaits -- the checkpoint lock must precede reads, repairs, and checkpoint advancement in this transaction
  const checkpoint = await getShadowAuditCheckpoint(query, true, checkpointName)
  const candidates = await listShadowAuditCandidates(query, checkpoint, limit)
  await candidates
    .filter(candidate => candidate.is_discrepant)
    .reduce(
      (pending, candidate) => pending.then(() => retainShadowAuditCandidate(query, candidate)),
      Promise.resolve(),
    )
  if (candidates.length === limit)
    await advanceShadowAuditCheckpoint(query, candidates.at(-1)!.id, checkpointName)
  else if (candidates.length > 0 || checkpoint)
    await resetShadowAuditCheckpoint(query, checkpointName)
  return makeShadowAuditResult(false, candidates, limit)
}

async function retainShadowAuditCandidate(
  query: TransactionQuery,
  candidate: ShadowAuditCandidate,
): Promise<void> {
  if (candidate.typed) {
    await recordPostPublicationShadowRepair(query, candidate.id)
    return
  }
  const work = await recordPostPublicationChange(query, {
    scope: { type: 'post', postId: candidate.id },
    reason: 'post_updated',
  })
  await Promise.all([
    retainAppliedProjectionIdentity(query, work.id, candidate.applied_identity),
    retainAppliedProjectionIdentity(query, work.id, candidate.current_identity),
  ])
}

async function resetShadowAuditCheckpoint(
  query: TransactionQuery,
  checkpointName: string,
): Promise<void> {
  await query(
    `/* resetPostPublicationShadowAuditCheckpoint */
    UPDATE post_publication_reconciliation_audit_checkpoints
    SET cursor_post_id = NULL WHERE checkpoint_name = $1`,
    [checkpointName],
  )
}

async function getShadowAuditCheckpoint(
  query?: TransactionQuery,
  lock = false,
  checkpointName = SHADOW_AUDIT_CHECKPOINT,
): Promise<string | null> {
  const executor = query ?? write
  const { rows } = await executor<{ cursor_post_id: string | null }>(
    `/* getPostPublicationShadowAuditCheckpoint */
    SELECT cursor_post_id FROM post_publication_reconciliation_audit_checkpoints
    WHERE checkpoint_name = $1${lock ? ' FOR UPDATE' : ''}`,
    [checkpointName],
  )
  return rows[0]?.cursor_post_id ?? null
}

async function listShadowAuditCandidates(
  query: TransactionQuery | undefined,
  checkpoint: string | null,
  limit: number,
): Promise<ShadowAuditCandidate[]> {
  const executor = query ?? write
  const typed = await isPostPublicationTypedProtocolActive(query)
  const compare = sql`/* listPostPublicationShadowAuditCandidates */
    WITH source_ids AS MATERIALIZED (
      SELECT id FROM (SELECT id FROM posts WHERE (${checkpoint}::uuid IS NULL OR id > ${checkpoint}::uuid) ORDER BY id LIMIT ${limit}) post_ids
      UNION
      SELECT post_id AS id FROM (SELECT post_id FROM post_publication_projection_receipts WHERE (${checkpoint}::uuid IS NULL OR post_id > ${checkpoint}::uuid) ORDER BY post_id LIMIT ${limit}) receipt_ids
    ), source_page AS MATERIALIZED (
      SELECT id FROM source_ids
      ORDER BY id LIMIT ${limit}
    )
    SELECT source_page.id, candidate.created_by_id IS NOT NULL AS has_author,
      root.community_id IS NOT NULL AS has_community,
      EXISTS (SELECT 1 FROM post__stories ps JOIN rss_feed_items item ON item.story_id = ps.story_id
        JOIN rss_feed_item_sources source ON source.rss_feed_item_id = item.id WHERE ps.post_id = root.id) AS has_rss_source,
      ${typed}::boolean AS typed, `
  compare.append(typed ? sql`NULL::jsonb AS applied_identity, ` : sql`receipt.applied_identity, `)
  compare.append(sql`CASE WHEN candidate.id IS NULL THEN
      '{"topicIds": [], "identityKeys": [], "sitemapTargets": []}'::jsonb ELSE `)
  compare.append(
    typed
      ? sql`'{"topicIds":[],"identityKeys":[],"sitemapTargets":[]}'::jsonb`
      : publicationProjectionIdentitySql(),
  ).append(sql` END AS current_identity,
      (candidate.id IS NULL OR receipt.post_id IS NULL OR receipt.eligibility_fingerprint IS DISTINCT FROM `)
  compare.append(publicationEligibilityFingerprintSql(typed))
  if (typed)
    compare
      .append(sql` OR receipt.applied_snapshot_id IS NULL OR `)
      .append(publicationSnapshotMismatchSql(sql`source_page.id`, sql`receipt.applied_snapshot_id`))
  else
    compare
      .append(sql` OR receipt.applied_identity IS DISTINCT FROM `)
      .append(publicationProjectionIdentitySql())
  compare.append(sql` OR EXISTS (
        SELECT 1 FROM post_publication_dirty_work work
        LEFT JOIN post_publication_dirty_work_keys retained ON retained.dirty_work_id = work.id
          AND retained.kind IN ('impact_post', 'impact_community')
        WHERE work.post_id = candidate.id
          OR (retained.kind = 'impact_post'
            AND (retained.uuid_value = candidate.id OR retained.uuid_value = root.id))
          OR work.author_user_id = root.created_by_id
          OR work.community_id = root.community_id
          OR (retained.kind = 'impact_community' AND retained.uuid_value = root.community_id)
      )) AS is_discrepant
    FROM source_page
    LEFT JOIN posts candidate ON candidate.id = source_page.id
    LEFT JOIN posts root ON root.id = COALESCE(candidate.root_id, candidate.id)
    LEFT JOIN post_publication_projection_receipts receipt ON receipt.post_id = source_page.id
    ORDER BY source_page.id`)
  const { rows } = await executor<ShadowAuditCandidate>(compare)
  return rows
}

async function advanceShadowAuditCheckpoint(
  query: TransactionQuery,
  cursorPostId: string,
  checkpointName: string,
): Promise<void> {
  await query(
    `/* advancePostPublicationShadowAuditCheckpoint */
    INSERT INTO post_publication_reconciliation_audit_checkpoints (checkpoint_name, cursor_post_id)
    VALUES ($1, $2) ON CONFLICT (checkpoint_name) DO UPDATE
    SET cursor_post_id = GREATEST(
      post_publication_reconciliation_audit_checkpoints.cursor_post_id, EXCLUDED.cursor_post_id
    )`,
    [checkpointName, cursorPostId],
  )
}
