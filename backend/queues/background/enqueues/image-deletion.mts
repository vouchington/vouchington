import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  IMAGE_DELETION_RECOVER_JOB,
  IMAGE_DELETION_PAGE_JOB,
  type ImageDeletionPageData,
  type ImageDeletionRecoveryData,
} from './image-deletion-jobs.mts'
import { createBackgroundBulkEnqueue } from '../enqueues.mts'
import type { JobOptions } from 'glide-mq'
import { background } from '../queues.mts'

export function getImageDeletionPageJobId(
  imageId: string,
  cursor: string | null,
  admittedThrough?: string,
): string {
  return `image-deletion-${imageId}-${cursor ?? 'start'}-${admittedThrough ?? 'pending'}`
}
const enqueuePages = createBackgroundBulkEnqueue(
  IMAGE_DELETION_PAGE_JOB,
  (data: ImageDeletionPageData) => ({
    data,
    opts: { jobId: getImageDeletionPageJobId(data.imageId, data.cursor, data.admittedThrough) },
  }),
)

export async function enqueueImageDeletionPage(
  imageId: string,
  cursor: string | null,
  admittedThrough?: string,
): Promise<void> {
  await enqueueImageDeletionPages([{ imageId, cursor, admittedThrough }])
}

export async function enqueueImageDeletionPages(inputs: ImageDeletionPageData[]): Promise<void> {
  await enqueueBulkReactivatingFinished({
    queue: background,
    inputs,
    jobIdOf: data => getImageDeletionPageJobId(data.imageId, data.cursor, data.admittedThrough),
    enqueueBulk: enqueuePages,
  })
}

const enqueueRecovery = createBackgroundBulkEnqueue(
  IMAGE_DELETION_RECOVER_JOB,
  (data: ImageDeletionRecoveryData) => ({ data }),
)
export async function enqueueImageDeletionRecovery(
  data: ImageDeletionRecoveryData = {},
  options?: Partial<JobOptions>,
): Promise<void> {
  const opts = { jobId: 'image-deletion-recovery', ...options }
  await enqueueBulkReactivatingFinished({
    queue: background,
    inputs: [data],
    jobIdOf: () => opts.jobId,
    enqueueBulk: inputs => enqueueRecovery(inputs, opts),
  })
}
