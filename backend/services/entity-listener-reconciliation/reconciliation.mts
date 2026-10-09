import type { EntityReconciliationCandidate, EntityReconciliationWindow } from './types.mts'
import { write, type QueryOptions } from '@data-stores/psql'
import { streamEntityReconciliationRows } from './candidates-query.mts'
import sql from 'sql-template-strings'

import { getEntityReconciliationLimits } from './work-limits.mts'
import type { CursorRunResult } from '@data-stores/psql/bounded-cursor-api'
const OVERLAP_MS = 5 * 60_000
const REPLICA_LAG_MARGIN_MS = 60_000

export type { EntityReconciliationCandidate, EntityReconciliationWindow } from './types.mts'

export async function getEntityReconciliationWindow(
  intervalSeconds: number,
  now = new Date(),
  options: QueryOptions = {},
): Promise<EntityReconciliationWindow> {
  const { rows } = await write(
    sql`/* getEntityReconciliationWindow */
    SELECT reconciled_through_at
    FROM entity_listener_reconciliation_cursors
    WHERE is_singleton
  `,
    options,
  )
  const end = new Date(now.getTime() - REPLICA_LAG_MARGIN_MS)
  const completedThrough = (rows[0] as { reconciled_through_at: Date } | undefined)
    ?.reconciled_through_at
  const start = completedThrough
    ? new Date(completedThrough.getTime() - OVERLAP_MS)
    : new Date(end.getTime() - intervalSeconds * 1000)
  return { start, end }
}

export async function* streamEntityReconciliationCandidateBatches(
  window: EntityReconciliationWindow,
  options: {
    after?: EntityReconciliationCandidate
    limits?: ReturnType<typeof getEntityReconciliationLimits>
    onComplete?: (result: Pick<CursorRunResult<unknown>, 'rowsRead' | 'hasMore'>) => void
  } = {},
): AsyncGenerator<EntityReconciliationCandidate[]> {
  const limits = options.limits ?? getEntityReconciliationLimits()
  const after = options.after
  let batch: EntityReconciliationCandidate[] = []
  for await (const row of streamEntityReconciliationRows(window, {
    after,
    limits,
    onComplete: options.onComplete,
  })) {
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
      ...(row.entity_type === 'user'
        ? { createdInWindow: row.details?.createdInWindow === true }
        : {}),
    })
    if (batch.length >= limits.batchSize) {
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
  options: QueryOptions = {},
): Promise<void> {
  await write(
    sql`/* advanceEntityReconciliationCheckpoint */
    INSERT INTO entity_listener_reconciliation_cursors (is_singleton, reconciled_through_at)
    VALUES (TRUE, ${completedThrough})
    ON CONFLICT (is_singleton) DO UPDATE
    SET reconciled_through_at = GREATEST(
      entity_listener_reconciliation_cursors.reconciled_through_at,
      EXCLUDED.reconciled_through_at
    )
  `,
    options,
  )
}
