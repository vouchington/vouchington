import { createReportIntegrityFlag } from '@services/report-integrity/create-flag'
import { detectMassReportCampaign } from '@services/report-integrity/detect'
import {
  streamEntitiesWithPendingReportsBatches,
  type PendingReportEntity,
} from '@services/report-integrity/backfill'
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

export async function processBackfillReportIntegrity(
  target?: PendingReportEntity,
): Promise<{ enqueued: number; jobIds?: string[] }> {
  let enqueued = 0
  const jobIds: string[] = []
  for await (const batch of streamEntitiesWithPendingReportsBatches(target)) {
    const jobs = await enqueueReportIntegrityCheckBatch(batch)
    if (target) jobIds.push(...jobs.map(job => job.id))
    enqueued += batch.length
  }
  return target ? { enqueued, jobIds } : { enqueued }
}
