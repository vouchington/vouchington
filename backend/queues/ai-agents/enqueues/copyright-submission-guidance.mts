import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'

/** One job per admitted run: a failed run is marked in SQL and the next sweep admits a new id. */
const jobIdFor = (runId: string) => `copyright_submission_guidance_${runId}`

type CopyrightSubmissionGuidanceEnqueue = { submissionId: string; runId: string }

const enqueueBatch = createBulkEnqueueFunction({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'copyright-submission-guidance',
  buildJob: ({ submissionId, runId }: CopyrightSubmissionGuidanceEnqueue) => ({
    data: { submission_id: submissionId, run_id: runId },
    opts: {
      ...AI_AGENTS_DEFAULTS,
      jobId: jobIdFor(runId),
      priority: AGENT_PRIORITY['copyright-submission-guidance'],
      deduplication: { id: jobIdFor(runId), mode: 'simple' },
      ordering: { key: `copyright_submission_guidance_${submissionId}`, concurrency: 1 },
    } satisfies JobOptions,
  }),
})

/** One bulk add per page; a job whose run id is still in flight is skipped, not duplicated. */
export async function enqueueCopyrightSubmissionGuidances(
  items: readonly CopyrightSubmissionGuidanceEnqueue[],
): Promise<void> {
  if (items.length === 0) return
  await enqueueBatch([...items])
}

export async function enqueueCopyrightSubmissionGuidance(
  submissionId: string,
  runId: string,
): Promise<void> {
  await enqueueCopyrightSubmissionGuidances([{ submissionId, runId }])
}
