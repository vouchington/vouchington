import type { EntityReconciliationCandidate, EntityReconciliationWindow } from './types.mts'
import { streamEntityReconciliationRows } from './candidates-query.mts'

import { getEntityReconciliationLimits, getEntityReconciliationLookback } from './work-limits.mts'
import type { CursorRunResult } from '@data-stores/psql/bounded-cursor-api'
export type { EntityReconciliationCandidate, EntityReconciliationWindow } from './types.mts'

export function getEntityReconciliationWindow(now = new Date()): EntityReconciliationWindow {
  const { lookback, margin } = getEntityReconciliationLookback()
  const end = new Date(now.getTime() - margin)
  return { start: new Date(end.getTime() - lookback), end }
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
