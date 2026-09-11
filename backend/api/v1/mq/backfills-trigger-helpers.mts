import type { BackfillTrigger } from './backfills-types.mts'
import type { EnqueueReturnType } from '@voucha/types'

export type BackfillDispatcherOptions = {
  deduplicationId?: string
}

export function createBackfillDispatcherTrigger(
  backfillId: string,
  enqueue: (options?: BackfillDispatcherOptions) => EnqueueReturnType,
): BackfillTrigger {
  return async () => await enqueue({ deduplicationId: `backfill:${backfillId}` })
}

export function createPriorityBackfillTrigger<TData>(
  data: TData,
  enqueue: (data: TData, priority: 100) => EnqueueReturnType,
): BackfillTrigger {
  return async () => await enqueue(data, 100)
}

export function createBackfillTrigger(enqueue: () => EnqueueReturnType): BackfillTrigger {
  return async () => await enqueue()
}
