import { createBackgroundEnqueue } from '@queues/background/enqueues'
import { POST_MENTIONS_PROCESS_JOB } from '@queues/background/enqueues/post-mentions-jobs'
import type { EnqueueReturnType } from '@voucha/types'
import { PRIORITY_DEFAULT } from './config.mts'

const enqueuePostMentionsJob = createBackgroundEnqueue(POST_MENTIONS_PROCESS_JOB)

/**
 * Enqueue a job to process mentions in a post
 */
export const enqueuePostMentions = (postId: string, priority?: number): EnqueueReturnType => {
  return enqueuePostMentionsJob({ postId }, { priority: priority ?? PRIORITY_DEFAULT })
}
