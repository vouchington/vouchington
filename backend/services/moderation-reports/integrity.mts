import onError from '@modules/on-error'
import { decorateModerationEnqueueError } from './enqueue-observability.mts'

/**
 * Fire-and-forget: enqueue a report-integrity check for the given entity after
 * a new moderation report is created. Uses debounce deduplication so rapid
 * reports on the same entity collapse into one check job.
 */
export function enqueueReportIntegrityCheck(entityType: string, entityId: string): void {
  import('@queues/report-integrity/enqueues')
    .then(({ enqueueReportIntegrityCheck: enqueue }) => enqueue(entityType, entityId))
    /* v8 ignore start -- fire-and-forget error handler; covered by process-level onError integration */
    .catch((err: Error) =>
      onError(
        decorateModerationEnqueueError(err, { stage: 'report-integrity', entityType, entityId }),
      ),
    )
  /* v8 ignore stop */
}
