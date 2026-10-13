import { createWorker, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job } from 'glide-mq'
import { MODERATION_OMNI_SINGLE_QUEUE_NAME } from '@queues/openai-moderation/config'
import { handleOpenAIModerationOmniSingleJob } from './openai-moderation-omni-single.mts'

type OpenAIModerationJobData = { id?: string }

export function createOpenAIModerationOmniSingleWorker({
  prefix = workerQueuePrefix,
}: { prefix?: string } = {}) {
  return createWorker(
    MODERATION_OMNI_SINGLE_QUEUE_NAME,
    (job: Job<OpenAIModerationJobData>): Promise<unknown> =>
      handleOpenAIModerationOmniSingleJob(job),
    {
      dedicatedCommandClient: true,
      prefix,
      concurrency: getWorkerConcurrency('openaiModerationOmniSingle', { baseline: 5 }),
      limiter: { max: 10, duration: 1000 },
    },
  )
}
