import { enqueueBulkReactivatingFinished } from '@data-stores/valkey-glide-mq/enqueue-or-reactivate'
import {
  IMAGE_DELETION_RECOVER_JOB,
  IMAGE_DELETION_PAGE_JOB,
  type ImageDeletionPageData,
  type ImageDeletionRecoveryData,
} from './image-deletion-jobs.mts'
import { createBackgroundBulkEnqueue, createBackgroundEnqueue } from '../enqueues.mts'
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

const enqueueRecovery = createBackgroundEnqueue(IMAGE_DELETION_RECOVER_JOB)
export async function enqueueImageDeletionRecovery(
  data: ImageDeletionRecoveryData = {},
  options?: Partial<JobOptions>,
): Promise<void> {
  await enqueueRecovery(data, options)
}
