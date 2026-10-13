import { createQueue } from '@data-stores/valkey-glide-mq'
import { QUEUE_NAME } from './config.mts'
import type { ExportRequestData } from './enqueues/types-account-data-requests.mts'
import type { UserDeletionJobData } from './enqueues/types-user-deletions.mts'

type AccountLifecycleJobData = ExportRequestData | UserDeletionJobData | Record<string, never>

export const accountLifecycle = createQueue<AccountLifecycleJobData>(QUEUE_NAME, {
  priorityKind: 'ranked',
})
