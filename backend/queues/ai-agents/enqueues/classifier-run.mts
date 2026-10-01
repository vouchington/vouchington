import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import {
  AI_AGENTS_QUEUE_NAME,
  AI_AGENTS_DEFAULTS,
  AGENT_PRIORITY,
  CLASSIFIER_RUN_ATTEMPTS,
  CLASSIFIER_RUN_BACKOFF,
} from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { ClassifierRunDispatcherJobData, ClassifierRunJobData } from '../types.mts'

export function classifierRunJobId(runId: string): string {
  return `classifier_run_${runId}`
}

/** One dispatcher per classifier and subject, so approval and the sweep cannot both dispatch. */
export function classifierRunDispatcherJobId(data: ClassifierRunDispatcherJobData): string {
  return `classifier_run_dispatcher_${data.classifier}_${data.postId ?? data.rssFeedItemId}`
}

function classifierRunOptions(runId: string): JobOptions {
  return {
    ...AI_AGENTS_DEFAULTS,
    // Sized for a provider outage of minutes; the same attempt count caps the receipt.
    attempts: CLASSIFIER_RUN_ATTEMPTS,
    backoff: CLASSIFIER_RUN_BACKOFF,
    priority: AGENT_PRIORITY['classifier-run'],
    jobId: classifierRunJobId(runId),
    removeOnComplete: true,
    // The Postgres receipt is authoritative. Removing failed queue jobs releases this stable
    // identity so the durable reconciler can enqueue another attempt.
    removeOnFail: true,
  }
}

function classifierRunDispatcherOptions(data: ClassifierRunDispatcherJobData): JobOptions {
  return {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY['classifier-run-dispatcher'],
    jobId: classifierRunDispatcherJobId(data),
    removeOnComplete: true,
    // The durable request row is authoritative; a failed dispatcher is retried by the sweep.
    removeOnFail: true,
  }
}

const enqueueClassifierRunBatch = createBulkEnqueueFunction<
  ClassifierRunJobData,
  ClassifierRunJobData,
  'classifier-run'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'classifier-run',
  buildJob: data => ({ data, opts: classifierRunOptions(data.runId) }),
})

const enqueueClassifierRunDispatcherBatch = createBulkEnqueueFunction<
  ClassifierRunDispatcherJobData,
  ClassifierRunDispatcherJobData,
  'classifier-run-dispatcher'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'classifier-run-dispatcher',
  buildJob: data => ({ data, opts: classifierRunDispatcherOptions(data) }),
})

export async function enqueueClassifierRunDispatcher(
  data: ClassifierRunDispatcherJobData,
): Promise<void> {
  await ai_agents.add('classifier-run-dispatcher', data, classifierRunDispatcherOptions(data))
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'classifier-run-dispatcher')
}

/** Adds the dispatchers for a page of requests; a dispatcher that still exists is skipped. */
export async function enqueueBulkClassifierRunDispatchers(
  items: readonly ClassifierRunDispatcherJobData[],
): Promise<void> {
  if (items.length === 0) return
  await enqueueClassifierRunDispatcherBatch([...items])
}

export async function enqueueClassifierRun(data: ClassifierRunJobData): Promise<void> {
  await ai_agents.add('classifier-run', data, classifierRunOptions(data.runId))
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'classifier-run')
}

/**
 * Adds the runs' jobs and returns the run ids whose job was actually added. A job whose stable id
 * still exists (pending, active or delayed, for instance parked by the spend cap) is silently
 * skipped by `addBulk`, so it is absent from the result.
 */
export async function enqueueBulkClassifierRuns(
  items: readonly ClassifierRunJobData[],
): Promise<string[]> {
  if (items.length === 0) return []
  const runIdByJobId = new Map(items.map(item => [classifierRunJobId(item.runId), item.runId]))
  // glide-mq omits a skipped job; the Vitest queue shim keeps a null in its place.
  const added: readonly ({ id?: string } | null)[] = await enqueueClassifierRunBatch([...items])
  return added.flatMap(job => {
    const runId = job?.id === undefined ? undefined : runIdByJobId.get(job.id)
    return runId === undefined ? [] : [runId]
  })
}

/** Whether the run's stable-id job is still retained in any queue state. */
export async function classifierRunJobExists(runId: string): Promise<boolean> {
  return (await ai_agents.getJob(classifierRunJobId(runId), { excludeData: true })) !== null
}
