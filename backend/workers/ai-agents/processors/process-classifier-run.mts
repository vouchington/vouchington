import type { Job } from 'glide-mq'
import { enqueueClassifierRun } from '@queues/ai-agents/enqueues/classifier-run'
import type { ClassifierRunDispatcherJobData, ClassifierRunJobData } from '@queues/ai-agents/types'
import type { ClassifierRunSubject } from '@services/classifier-runs'
import { toClassifierRunJobData, type ClassifierRunJobResult } from './classifier-run-handler.mts'
import { getClassifierRunHandler } from './classifier-run-registry.mts'

function dispatcherSubject(data: ClassifierRunDispatcherJobData): ClassifierRunSubject | null {
  if (data.postId && !data.rssFeedItemId) return { postId: data.postId, rssFeedItemId: null }
  if (data.rssFeedItemId && !data.postId) return { postId: null, rssFeedItemId: data.rssFeedItemId }
  return null
}

/**
 * Reserves the run of a requested subject, then enqueues its stable-id job. Every classifier shares
 * this shape; a subject that is not ready or no longer eligible leaves its request for the sweep.
 */
export async function processClassifierRunDispatcher(
  job: Job<ClassifierRunDispatcherJobData>,
): Promise<{ kind: 'enqueued' | 'no-work' | 'stale' | 'not-ready' }> {
  const handler = getClassifierRunHandler(job.data.classifier)
  const subject = dispatcherSubject(job.data)
  if (!subject) return { kind: 'stale' }
  const result = await handler.reserve(subject)
  if (result.kind !== 'reserved') return { kind: result.kind }
  await enqueueClassifierRun(toClassifierRunJobData(handler.slug, result.run))
  return { kind: 'enqueued' }
}

export function processClassifierRun(
  job: Job<ClassifierRunJobData>,
): Promise<ClassifierRunJobResult> {
  return getClassifierRunHandler(job.data.classifier).run(job)
}
