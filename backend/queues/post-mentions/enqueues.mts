import { createEnqueueFunction } from '@data-stores/valkey-glide-mq'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT, QUEUE_NAME } from './config.mts'
import { postMentions } from './queues.mts'
import type { PostMentionsJobs } from './types.mts'

const enqueuePostMentionsJob = createEnqueueFunction<{ postId: string }, PostMentionsJobs>({
  queue: postMentions,
  queueName: QUEUE_NAME,
  jobName: 'processPostMentions',
})

/**
 * Enqueue a job to process mentions in a post
 */
export const enqueuePostMentions = (postId: string, priority?: number): EnqueueReturnType => {
  return enqueuePostMentionsJob({ postId }, { priority: priority ?? PRIORITY_DEFAULT })
}
