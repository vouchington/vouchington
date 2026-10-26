import type { JobOptions } from 'glide-mq'
import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import onError from '@modules/on-error'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { AppealResolutionJobData } from '../types.mts'
import { failedAiJobHasNoPendingResponses } from './failed-job-recovery.mts'

type AppealResolutionInput = {
  appealId: string
  requestToken: string
  rerunById?: string | null
}

function buildAppealResolutionJob(
  appealId: string,
  requestToken: string,
  rerunById?: string | null,
): { data: AppealResolutionJobData; opts: JobOptions } {
  const isManualRerun = rerunById != null
  return {
    data: {
      appeal_id: appealId,
      ai_draft_request_token: requestToken,
      rerun_by_id: rerunById ?? null,
    } satisfies AppealResolutionJobData,
    opts: {
      jobId: `appeal_resolution_${requestToken}`,
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: false,
      priority: AGENT_PRIORITY['appeal-resolution'],
      // Automatic retries coalesce per appeal. Manual generations keep distinct request IDs
      // so a later staff rerun is not suppressed by an earlier request.
      ...(isManualRerun
        ? {}
        : {
            deduplication: {
              id: `appeal_resolution_automatic_${appealId}`,
              mode: 'simple' as const,
            },
          }),
      // Both lanes share one per-appeal ordering group, so the manual generation waits for an
      // automatic retry rather than executing beside it.
      ordering: {
        key: `appeal_resolution_${appealId}`,
        concurrency: 1,
      },
    } satisfies JobOptions,
  }
}

const enqueueAppealResolutionBatch = createBulkEnqueueFunction({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'appeal-resolution',
  buildJob: (input: AppealResolutionInput) =>
    buildAppealResolutionJob(input.appealId, input.requestToken, input.rerunById),
})

function enqueueRecoverableAppealResolution(input: AppealResolutionInput) {
  return enqueueBulkReactivatingFinished({
    queue: ai_agents,
    inputs: [input],
    jobIdOf: item => `appeal_resolution_${item.requestToken}`,
    enqueueBulk: enqueueAppealResolutionBatch,
    canRemoveFailed: failedAiJobHasNoPendingResponses,
  })
}

/**
 * Enqueues an appeal-resolution agent run for the given appeal.
 * Fire-and-forget — errors are swallowed via onError.
 */
export function enqueueAppealResolution(
  appealId: string,
  requestToken: string,
  rerunById?: string | null,
): void {
  enqueueRecoverableAppealResolution({ appealId, requestToken, rerunById }).catch(onError)
}

/**
 * Awaitable variant for manual staff-triggered re-runs: propagates enqueue failures so the
 * caller can surface an error instead of falsely reporting the job as queued.
 */
export async function enqueueAppealResolutionQueued(
  appealId: string,
  requestToken: string,
  rerunById?: string | null,
): Promise<string> {
  const [job] = await enqueueRecoverableAppealResolution({ appealId, requestToken, rerunById })
  if (!job) throw new Error('Appeal resolution rerun was not admitted to the queue')
  return job.id
}
