import { createReportIntegrityFlag } from '@services/report-integrity/create-flag'
import { detectMassReportCampaign } from '@services/report-integrity/detect'
import {
  listPendingReportEntityPage,
  type PendingReportEntity,
} from '@services/report-integrity/backfill'
import {
  enqueueContinueBackfillReportIntegrity,
  enqueueReportIntegrityCheckBatch,
} from '@queues/vote-aggregation/enqueues/report-integrity'
import onError from '@modules/on-error'
import type {
  BackfillReportIntegrityData,
  ProcessReportIntegrityCheckData,
} from '@queues/vote-aggregation/enqueues/types-report-integrity'

export async function processReportIntegrityCheck(
  data: ProcessReportIntegrityCheckData,
): Promise<void> {
  try {
    const { entityType, entityId } = data

    const result = await detectMassReportCampaign(entityType, entityId, new Date())

    if (result.flagged) {
      await createReportIntegrityFlag(
        entityType,
        entityId,
        result.reporter_count,
        result.new_account_reporter_percent,
        result.details,
        result.reporter_user_ids,
      )
    }
  } catch (err) {
    onError(err instanceof Error ? err : new Error(String(err)))
    throw err
  }
}

/** Enqueues one bounded page of integrity checks, then continues from the page's last entity id. */
export async function processBackfillReportIntegrity(
  data: BackfillReportIntegrityData = {},
  target?: PendingReportEntity,
): Promise<{ enqueued: number }> {
  const { entities, nextCursor } = await listPendingReportEntityPage(
    Date.now(),
    data.afterId,
    target,
  )
  if (entities.length > 0) await enqueueReportIntegrityCheckBatch(entities)
  if (nextCursor) await enqueueContinueBackfillReportIntegrity(nextCursor)
  return { enqueued: entities.length }
}
