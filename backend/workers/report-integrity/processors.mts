import { createReportIntegrityFlag } from '@services/report-integrity/create-flag'
import { detectMassReportCampaign } from '@services/report-integrity/detect'
import { streamEntitiesWithPendingReportsBatches } from '@services/report-integrity/backfill'
import { enqueueReportIntegrityCheckBatch } from '@queues/report-integrity/enqueues'
import onError from '@modules/on-error'
import type { ProcessReportIntegrityCheckData } from '@queues/report-integrity/types'

export async function processReportIntegrityCheck(
  data: ProcessReportIntegrityCheckData,
): Promise<void> {
  try {
    const { entityType, entityId } = data

    const result = await detectMassReportCampaign(entityType, entityId)

    if (result.flagged) {
      await createReportIntegrityFlag(
        entityType,
        entityId,
        result.reporter_count,
        result.new_account_reporter_pct,
        result.details,
      )
    }
  } catch (error) {
    onError(error instanceof Error ? error : new Error(String(error)))
    throw error
  }
}

export async function processBackfillReportIntegrity(): Promise<{ enqueued: number }> {
  let enqueued = 0
  for await (const batch of streamEntitiesWithPendingReportsBatches()) {
    await enqueueReportIntegrityCheckBatch(batch)
    enqueued += batch.length
  }
  return { enqueued }
}
