import type { EnqueueReturnType } from '@voucha/types'
import type { JobOptions } from 'glide-mq'
import { createBulkEnqueueFunction } from '@data-stores/valkey-glide-mq'
import { BACKGROUND_CPU_QUEUE_NAME } from '@queues/background-cpu/config'
import { requireBackgroundCpuJob } from '@queues/background-cpu/enqueues/registry'
import { createBackgroundCpuEnqueueFunction } from '@queues/background-cpu/enqueues/typed-job'
import { backgroundCpu } from '@queues/background-cpu/queues'

const enqueueCleanupJob = createBackgroundCpuEnqueueFunction(
  'content-analysis.cleanup-abandoned-uploads',
)

export function enqueueCleanupAbandonedUploads(): EnqueueReturnType {
  return enqueueCleanupJob({}, { priority: 100 })
}

type StaydownHashSource = 'upload' | 'registration'
type StaydownHashInput = { imageId: string; source: StaydownHashSource }

function buildStaydownHashJob({ imageId, source }: StaydownHashInput): {
  data: { id: string }
  opts: Partial<JobOptions>
} {
  return {
    data: { id: imageId },
    opts: {
      priority: 10,
      deduplication: { id: `content-analysis:staydown-hash:${source}:${imageId}`, mode: 'simple' },
    },
  }
}

const enqueueStaydownHashJob = createBackgroundCpuEnqueueFunction('content-analysis.staydown-hash')
const enqueueStaydownHashBatch = createBulkEnqueueFunction({
  queue: backgroundCpu,
  queueName: BACKGROUND_CPU_QUEUE_NAME,
  jobName: 'content-analysis.staydown-hash',
  defaults: requireBackgroundCpuJob('content-analysis.staydown-hash').options,
  buildJob: buildStaydownHashJob,
})

export function enqueueStaydownHash(
  imageId: string,
  source: StaydownHashSource,
): EnqueueReturnType {
  const { data, opts } = buildStaydownHashJob({ imageId, source })
  return enqueueStaydownHashJob(data, opts)
}

/** Queues one hash job per distinct image in a single call; an empty list adds nothing. */
export function enqueueBulkStaydownHashes(
  imageIds: Iterable<string>,
  source: StaydownHashSource,
): ReturnType<typeof enqueueStaydownHashBatch> {
  return enqueueStaydownHashBatch([...new Set(imageIds)].map(imageId => ({ imageId, source })))
}
