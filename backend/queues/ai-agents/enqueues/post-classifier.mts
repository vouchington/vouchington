import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { PostClassifierDispatcherJobData, PostClassifierJobData } from '../types.mts'

export function postClassifierJobId(applicationId: string): string {
  return `post_classifier_${applicationId}`
}

function postClassifierOptions(applicationId: string): JobOptions {
  return {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY['post-classifier'],
    jobId: postClassifierJobId(applicationId),
    removeOnComplete: true,
    // The Postgres receipt is authoritative. Removing failed queue jobs releases this stable
    // identity so the durable reconciler can enqueue another attempt.
    removeOnFail: true,
  }
}

const enqueuePostClassifierBatch = createBulkEnqueueFunction<
  PostClassifierJobData,
  PostClassifierJobData,
  'post-classifier'
>({
  queue: ai_agents,
  queueName: AI_AGENTS_QUEUE_NAME,
  jobName: 'post-classifier',
  buildJob: data => ({ data, opts: postClassifierOptions(data.applicationId) }),
})

export async function enqueuePostClassifierDispatcher(postId: string): Promise<void> {
  await ai_agents.add(
    'post-classifier-dispatcher',
    { postId } satisfies PostClassifierDispatcherJobData,
    {
      ...AI_AGENTS_DEFAULTS,
      priority: AGENT_PRIORITY['post-classifier-dispatcher'],
    } satisfies JobOptions,
  )
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'post-classifier-dispatcher')
}

export async function enqueuePostClassifier(data: PostClassifierJobData): Promise<void> {
  await ai_agents.add('post-classifier', data, postClassifierOptions(data.applicationId))
  trackJobEnqueue(AI_AGENTS_QUEUE_NAME, 'post-classifier')
}

/**
 * Adds the receipts' jobs and returns the application ids whose job was actually added. A job
 * whose stable id still exists (pending, active or delayed, for instance parked by the spend cap)
 * is silently skipped by `addBulk`, so it is absent from the result.
 */
export async function enqueueBulkPostClassifiers(
  items: readonly PostClassifierJobData[],
): Promise<string[]> {
  const applicationIdByJobId = new Map(
    items.map(item => [postClassifierJobId(item.applicationId), item.applicationId]),
  )
  // glide-mq omits a skipped job; the Vitest queue shim keeps a null in its place.
  const added: readonly ({ id?: string } | null)[] = await enqueuePostClassifierBatch([...items])
  return added.flatMap(job => {
    const applicationId = job?.id === undefined ? undefined : applicationIdByJobId.get(job.id)
    return applicationId === undefined ? [] : [applicationId]
  })
}

/** Whether the receipt's stable-id job is still retained in any queue state. */
export async function postClassifierJobExists(applicationId: string): Promise<boolean> {
  return (
    (await ai_agents.getJob(postClassifierJobId(applicationId), { excludeData: true })) !== null
  )
}
