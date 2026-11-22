import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { AI_AGENTS_DEFAULTS, AI_AGENTS_QUEUE_NAME, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'

/** One job per admitted run: a failed run is marked in SQL and the next sweep admits a new id. */
const jobIdFor = (runId: string) => `copyright_appeal_recommendation_${runId}`

type CopyrightAppealRecommendationEnqueue = { submissionId: string; runId: string }

const enqueueBatch = createBulkEnqueueFunction({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'copyright-appeal-recommendation',
  buildJob: ({ submissionId, runId }: CopyrightAppealRecommendationEnqueue) => ({
    data: { submission_id: submissionId, run_id: runId },
    opts: {
      ...AI_AGENTS_DEFAULTS,
      jobId: jobIdFor(runId),
      priority: AGENT_PRIORITY['copyright-appeal-recommendation'],
      deduplication: { id: jobIdFor(runId), mode: 'simple' },
      ordering: { key: `copyright_appeal_recommendation_${submissionId}`, concurrency: 1 },
    } satisfies JobOptions,
  }),
})

/** One bulk add per page; a job whose run id is still in flight is skipped, not duplicated. */
export async function enqueueCopyrightAppealRecommendations(
  items: readonly CopyrightAppealRecommendationEnqueue[],
): Promise<void> {
  if (items.length === 0) return
  await enqueueBatch([...items])
}

export async function enqueueCopyrightAppealRecommendation(
  submissionId: string,
  runId: string,
): Promise<void> {
  await enqueueCopyrightAppealRecommendations([{ submissionId, runId }])
}
