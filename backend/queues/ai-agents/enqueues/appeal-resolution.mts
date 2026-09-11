import type { JobOptions } from 'glide-mq'
import onError from '@modules/on-error'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { AppealResolutionJobData } from '../types.mts'

function buildAppealResolutionJob(
  appealId: string,
  rerunById?: string | null,
): { data: AppealResolutionJobData; opts: JobOptions } {
  const isManualRerun = rerunById != null
  return {
    data: {
      appeal_id: appealId,
      rerun_by_id: rerunById ?? null,
    } satisfies AppealResolutionJobData,
    opts: {
      attempts: AI_AGENTS_DEFAULTS.attempts,
      backoff: AI_AGENTS_DEFAULTS.backoff,
      removeOnComplete: AI_AGENTS_DEFAULTS.removeOnComplete,
      removeOnFail: AI_AGENTS_DEFAULTS.removeOnFail,
      priority: AGENT_PRIORITY['appeal-resolution'],
      // Manual reruns coalesce with each other, but never with automatic work: an automatic
      // retry may correctly no-op after persisting its draft while a later staff rerun must run.
      deduplication: {
        id: isManualRerun
          ? `appeal_resolution_manual_${appealId}`
          : `appeal_resolution_automatic_${appealId}`,
        mode: 'simple' as const,
      },
      // Both lanes share one per-appeal ordering group, so the manual generation waits for an
      // automatic retry rather than executing beside it.
      ordering: {
        key: `appeal_resolution_${appealId}`,
        concurrency: 1,
      },
    } satisfies JobOptions,
  }
}

/**
 * Enqueues an appeal-resolution agent run for the given appeal.
 * Fire-and-forget — errors are swallowed via onError.
 */
export function enqueueAppealResolution(appealId: string, rerunById?: string | null): void {
  const { data, opts } = buildAppealResolutionJob(appealId, rerunById)
  ai_agents.add('appeal-resolution', data, opts).catch(onError)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'appeal-resolution')
}

/**
 * Awaitable variant for manual staff-triggered re-runs: propagates enqueue failures so the
 * caller can surface an error instead of falsely reporting the job as queued.
 */
export async function enqueueAppealResolutionAndWait(
  appealId: string,
  rerunById?: string | null,
): Promise<void> {
  const { data, opts } = buildAppealResolutionJob(appealId, rerunById)
  await ai_agents.add('appeal-resolution', data, opts)
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'appeal-resolution')
}
