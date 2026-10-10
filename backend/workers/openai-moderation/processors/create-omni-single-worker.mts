import { createWorker, workerQueuePrefix } from '@data-stores/valkey-glide-mq'
import { getWorkerConcurrency } from '@modules/queue-config'
import type { Job, Worker } from 'glide-mq'
import { MODERATION_OMNI_SINGLE_QUEUE_NAME } from '@queues/openai-moderation/config'
import { handleOpenAIModerationOmniSingleJob } from './openai-moderation-omni-single.mts'

type OpenAIModerationJobData = { id?: string }

export function createOpenAIModerationOmniSingleWorker({
  prefix = workerQueuePrefix,
}: { prefix?: string } = {}) {
  const openaiModerationOmniSingleWorkerRef: { current?: Worker } = {}
  let resolveOpenAIModerationOmniSingleWorker: (worker: Worker) => void = () => {}
  const openaiModerationOmniSingleWorkerReady = new Promise<Worker>(resolve => {
    resolveOpenAIModerationOmniSingleWorker = resolve
  })

  function getOpenAIModerationOmniSingleWorker(): Promise<Worker> {
    return openaiModerationOmniSingleWorkerRef.current
      ? Promise.resolve(openaiModerationOmniSingleWorkerRef.current)
      : openaiModerationOmniSingleWorkerReady
  }

  async function processOpenAIModerationOmniSingleJob(
    job: Job<OpenAIModerationJobData>,
  ): Promise<unknown> {
    return handleOpenAIModerationOmniSingleJob(job, await getOpenAIModerationOmniSingleWorker())
  }

  const openai_moderation_omni_single = createWorker(
    MODERATION_OMNI_SINGLE_QUEUE_NAME,
    (job: Job<OpenAIModerationJobData>): Promise<unknown> =>
      processOpenAIModerationOmniSingleJob(job),
    {
      dedicatedCommandClient: true,
      prefix,
      concurrency: getWorkerConcurrency('openaiModerationOmniSingle', { baseline: 5 }),
      limiter: { max: 10, duration: 1000 },
    },
  )
  openaiModerationOmniSingleWorkerRef.current = openai_moderation_omni_single
  resolveOpenAIModerationOmniSingleWorker(openai_moderation_omni_single)
  return openai_moderation_omni_single
}
