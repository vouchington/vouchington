import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { JobOptions } from 'glide-mq'
import { trackJobEnqueue } from '@services/analytics'
import { AI_AGENTS_QUEUE_NAME, AI_AGENTS_DEFAULTS, AGENT_PRIORITY } from '../config.mts'
import { ai_agents } from '../queues.mts'
import type { PostClassifierDispatcherJobData, PostClassifierJobData } from '../types.mts'

function postClassifierOptions(applicationId: string): JobOptions {
  return {
    ...AI_AGENTS_DEFAULTS,
    priority: AGENT_PRIORITY['post-classifier'],
    jobId: `post_classifier_${applicationId}`,
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

export async function enqueueBulkPostClassifiers(
  items: readonly PostClassifierJobData[],
): Promise<void> {
  await enqueuePostClassifierBatch([...items])
}
