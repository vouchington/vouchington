import { createAsyncGeneratorFromCursor, write } from '@data-stores/psql'
import { getMinUUIDv7ForDate } from '@modules/utils'
import sql from 'sql-template-strings'

const CHECKPOINT_NAME = 'entity-listeners'
const BATCH_SIZE = 500
const OVERLAP_MS = 5 * 60_000
const REPLICA_LAG_MARGIN_MS = 60_000

export type ReconciledEntityType =
  | 'user'
  | 'topic'
  | 'post_created'
  | 'post_updated'
  | 'post_deleted'
  | 'image'
  | 'url'

export type EntityReconciliationCandidate = {
  entityType: ReconciledEntityType
  entityId: string
  changedAtEpochUs: string
  changeId?: string
  contentChanged?: boolean
  referrerId?: string
}

export type EntityReconciliationWindow = {
  start: Date
  end: Date
}

export async function getEntityReconciliationWindow(
  intervalSeconds: number,
  now = new Date(),
  checkpointName = CHECKPOINT_NAME,
): Promise<EntityReconciliationWindow> {
  const { rows } = await write(sql`/* getEntityReconciliationWindow */
    SELECT completed_through
    FROM queue_reconciliation_checkpoints
    WHERE queue_name = ${checkpointName}
  `)
  const end = new Date(now.getTime() - REPLICA_LAG_MARGIN_MS)
  const completedThrough = (rows[0] as { completed_through: Date } | undefined)?.completed_through
  const start = completedThrough
    ? new Date(completedThrough.getTime() - OVERLAP_MS)
    : new Date(end.getTime() - intervalSeconds * 1000)
  return { start, end }
}

export async function* streamEntityReconciliationCandidateBatches(
  window: EntityReconciliationWindow,
): AsyncGenerator<EntityReconciliationCandidate[]> {
  const firstRevisionId = getMinUUIDv7ForDate(window.start)
  const afterLastRevisionId = getMinUUIDv7ForDate(new Date(window.end.getTime() + 1))
  let batch: EntityReconciliationCandidate[] = []
  for await (const row of createAsyncGeneratorFromCursor<{
    entity_type: ReconciledEntityType
    entity_id: string
    changed_at_epoch_us: string
    change_id: string | null
    details: Record<string, unknown> | null
  }>(
    sql`/* streamEntityReconciliationCandidateBatches */
      SELECT entity_type, entity_id, changed_at_epoch_us, change_id, details
      FROM (
        SELECT 'user'::text AS entity_type, id AS entity_id,
          floor(extract(epoch FROM updated_at) * 1000000)::text AS changed_at_epoch_us,
          NULL::uuid AS change_id,
          jsonb_build_object('referrerId', referrer_id) AS details,
          updated_at AS changed_at
        FROM users
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end} AND deleted_at IS NULL
        UNION ALL
        SELECT 'topic', id, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::uuid, NULL::jsonb, updated_at
        FROM topics
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
          AND deleted_at IS NULL AND merged_into_topic_id IS NULL
        UNION ALL
        SELECT CASE revision_type
            WHEN 'create' THEN 'post_created'
            WHEN 'update' THEN 'post_updated'
            WHEN 'delete' THEN 'post_deleted'
          END,
          post_id,
          floor(extract(epoch FROM created_at) * 1000000)::text,
          id, jsonb_build_object('changes', changes), created_at
        FROM post_revisions
        WHERE id >= ${firstRevisionId} AND id < ${afterLastRevisionId}
        UNION ALL
        SELECT 'image', id, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::uuid, NULL::jsonb, updated_at
        FROM images
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
          AND deleted_at IS NULL AND upload_completed_at IS NOT NULL
        UNION ALL
        SELECT 'url', id, floor(extract(epoch FROM updated_at) * 1000000)::text,
          NULL::uuid, NULL::jsonb, updated_at
        FROM urls
        WHERE updated_at >= ${window.start} AND updated_at <= ${window.end}
      ) candidates
      ORDER BY changed_at, entity_id, entity_type, change_id
    `,
    { batchSize: BATCH_SIZE },
  )) {
    const changes = row.details?.changes as Record<string, { before?: unknown }> | undefined
    batch.push({
      entityType: row.entity_type,
      entityId: row.entity_id,
      changedAtEpochUs: row.changed_at_epoch_us,
      ...(row.change_id ? { changeId: row.change_id } : {}),
      ...(row.entity_type === 'post_updated'
        ? { contentChanged: isPostContentChange(changes) }
        : {}),
      ...(row.entity_type === 'user' && typeof row.details?.referrerId === 'string'
        ? { referrerId: row.details.referrerId }
        : {}),
    })
    if (batch.length >= BATCH_SIZE) {
      yield batch
      batch = []
    }
  }
  if (batch.length > 0) yield batch
}

function isPostContentChange(changes?: Record<string, unknown>): boolean {
  if (!changes) return false
  return ['title', 'markdown', 'ai_summary_markdown', 'structured_data', 'post_images'].some(
    field => field in changes,
  )
}

export async function advanceEntityReconciliationCheckpoint(
  completedThrough: Date,
  checkpointName = CHECKPOINT_NAME,
): Promise<void> {
  await write(sql`/* advanceEntityReconciliationCheckpoint */
    INSERT INTO queue_reconciliation_checkpoints (queue_name, completed_through)
    VALUES (${checkpointName}, ${completedThrough})
    ON CONFLICT (queue_name) DO UPDATE
    SET completed_through = GREATEST(
      queue_reconciliation_checkpoints.completed_through,
      EXCLUDED.completed_through
    )
  `)
}
