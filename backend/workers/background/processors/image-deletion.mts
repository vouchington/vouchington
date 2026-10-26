import { processPagedDispatcher } from '@data-stores/valkey-glide-mq/paged-dispatcher'
import { background } from '@queues/background/queues'
import { enqueueImageDeletionRecovery } from '@queues/background/enqueues/image-deletion'
import type { ImageDeletionRecoveryData } from '@queues/background/enqueues/image-deletion-jobs'
import { dispatchImageDeletionRecoveryPage } from '@services/images/recover-deletions'
import type { Job } from 'glide-mq'

export function processImageDeletionRecovery(job: Job<ImageDeletionRecoveryData>) {
  return processPagedDispatcher(job, {
    dispatcher: 'images',
    cursorKey: 'id',
    target: background,
    targetName: 'background',
    readAndDispatch: pageSize => dispatchImageDeletionRecoveryPage(job.data, pageSize),
    enqueueNext: enqueueImageDeletionRecovery,
  })
}
