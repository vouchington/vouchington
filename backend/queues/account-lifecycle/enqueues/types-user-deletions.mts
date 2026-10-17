import type { AccountLifecycleUserDeletionData } from '@queues/background/enqueues/account-lifecycle-jobs'

export type UserDeletionEnqueueData = AccountLifecycleUserDeletionData & { delayMs?: number }
