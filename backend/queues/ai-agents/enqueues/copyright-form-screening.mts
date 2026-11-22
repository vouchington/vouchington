import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { AGENT_PRIORITY, AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME } from '../config.mts'
import { ai_agents } from '../queues.mts'

const jobIdFor = (submissionId: string) => `copyright_form_screening_${submissionId}`

const enqueueBatch = createBulkEnqueueFunction({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'copyright-form-screening',
  buildJob: (submissionId: string) => ({
    data: { submission_id: submissionId },
    opts: {
      ...AI_AGENTS_DEFAULTS,
      jobId: jobIdFor(submissionId),
      // Screening has no run row: the submission's pending state in SQL is the only record. A
      // completed job releases its id here, and a failed one through `removeOnFail`, so the next
      // sweep can add it again while the submission is still pending.
      removeOnComplete: true,
      priority: AGENT_PRIORITY['copyright-form-screening'],
      deduplication: { id: jobIdFor(submissionId), mode: 'simple' },
      ordering: { key: jobIdFor(submissionId), concurrency: 1 },
    } satisfies JobOptions,
  }),
})

/** One bulk add per page; a submission whose job is still in flight is skipped, not duplicated. */
export async function enqueueCopyrightFormScreenings(
  submissionIds: readonly string[],
): Promise<void> {
  if (submissionIds.length === 0) return
  await enqueueBatch([...submissionIds])
}

export async function enqueueCopyrightFormScreening(submissionId: string): Promise<void> {
  await enqueueCopyrightFormScreenings([submissionId])
}
