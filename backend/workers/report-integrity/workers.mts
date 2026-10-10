import { createWorker } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { QUEUE_NAME } from '@queues/report-integrity/config'
import type { ReportIntegrityJobs } from '@queues/report-integrity/types'
import { processBackfillReportIntegrity, processReportIntegrityCheck } from './processors.mts'

async function processJob(job: Job): Promise<void> {
  switch (job.name as ReportIntegrityJobs) {
    case 'processReportIntegrityCheck':
      await processReportIntegrityCheck(job.data)
      break
    case 'backfill_report_integrity':
      /* v8 ignore start -- dispatcher; exercised only when a backfill job is enqueued */
      await processBackfillReportIntegrity()
      break
    /* v8 ignore stop */
    default:
      throw new Error(`Unknown job name: ${job.name}`)
  }
}

export const reportIntegrity = createWorker(QUEUE_NAME, processJob, {
  dedicatedCommandClient: true,
  concurrency: getWorkerConcurrency('reportIntegrity', { baseline: 5 }),
})
